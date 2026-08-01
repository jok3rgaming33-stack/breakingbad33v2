"use server"

import { db } from "@/lib/db"
import { userVerifications, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyVendor } from "@/lib/push"
import { createGeneralInquiryThread, addMessage } from "@/app/actions/messaging"
import {
  getMyRecoveryStatus,
  markRecoveryKycSubmitted,
} from "@/app/actions/lost-key"

// Indique si un client doit encore réaliser sa vérification d'identité.
// - 1re commande : tant qu'aucun enregistrement n'existe
// - récupération de compte (clé perdue) : tant que pas validée
export async function needsVerification(token: string | undefined | null): Promise<boolean> {
  const t = token?.trim()
  if (!t) return false

  // Dossier récupération ouvert → KYC obligatoire tant que pas validé
  try {
    const recovery = await getMyRecoveryStatus(t)
    if (recovery?.active && recovery.needsKyc) return true
    if (recovery?.active && recovery.status === "kyc_submitted") {
      // KYC déjà soumis, pas besoin de resoumettre tant que pending admin
      return false
    }
  } catch {
    /* ignore */
  }

  const rows = await db
    .select({ id: userVerifications.id, status: userVerifications.status })
    .from(userVerifications)
    .where(eq(userVerifications.userToken, t))
    .limit(1)
  if (rows.length === 0) return true
  // En attente de validation admin : pas de resoumission
  return false
}

// Enregistre la vérification une fois les fichiers uploadés dans le Blob privé.
export async function submitVerification(input: {
  token: string
  photoPathname: string
  videoPathname: string
  siteName: string
  recordedAt: string
}) {
  const t = input.token?.trim()
  if (!t || !input.photoPathname || !input.videoPathname) {
    return { ok: false as const, error: "Vérification incomplète." }
  }

  const account = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const pseudo = account[0]?.pseudo ?? null

  // Upsert : un seul enregistrement par token.
  await db
    .insert(userVerifications)
    .values({
      userToken: t,
      pseudo,
      photoPathname: input.photoPathname,
      videoPathname: input.videoPathname,
      siteName: input.siteName,
      recordedAt: input.recordedAt,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: userVerifications.userToken,
      set: {
        photoPathname: input.photoPathname,
        videoPathname: input.videoPathname,
        siteName: input.siteName,
        recordedAt: input.recordedAt,
        status: "pending",
      },
    })

  // Si dossier récupération de compte : passe en kyc_submitted
  try {
    await markRecoveryKycSubmitted(t)
  } catch {
    /* ignore */
  }

  const recovery = await getMyRecoveryStatus(t).catch(() => null)
  const isRecovery = recovery?.active

  await notifyVendor({
    title: isRecovery ? "KYC récupération de compte" : "Vérification d'identité",
    body: isRecovery
      ? `${pseudo ?? "Client"} (récup. ${recovery?.claimedPseudo ?? "?"}) a soumis son KYC.`
      : `${pseudo ?? "Un client"} a soumis sa vérification (1re commande).`,
    url: "/admin",
    tag: isRecovery ? "recovery-kyc" : "verification",
  })

  return { ok: true as const }
}

export type VerificationRow = {
  id: number
  userToken: string
  pseudo: string | null
  photoPathname: string | null
  videoPathname: string | null
  siteName: string | null
  recordedAt: string | null
  status: string
  createdAt: Date | string
  /** true si ce KYC est lié à une récupération de compte (clé perdue) */
  isRecovery?: boolean
  claimedPseudo?: string | null
  recoveryClaimId?: number | null
}

// Liste des vérifications (réservé admin).
export async function listVerifications(): Promise<VerificationRow[]> {
  if (!(await isAdminAuthenticated())) return []
  const rows = await db
    .select({
      id: userVerifications.id,
      userToken: userVerifications.userToken,
      pseudo: userVerifications.pseudo,
      photoPathname: userVerifications.photoPathname,
      videoPathname: userVerifications.videoPathname,
      siteName: userVerifications.siteName,
      recordedAt: userVerifications.recordedAt,
      status: userVerifications.status,
      createdAt: userVerifications.createdAt,
    })
    .from(userVerifications)
    .orderBy(userVerifications.createdAt)

  // Enrichir avec dossiers récupération
  const { listRecoveryClaims } = await import("@/app/actions/lost-key")
  const claims = await listRecoveryClaims().catch(() => [])
  const byToken = new Map(
    claims
      .filter((c) => c.status === "pending_kyc" || c.status === "kyc_submitted")
      .map((c) => [c.provisionalToken, c]),
  )

  return rows.map((r) => {
    const claim = byToken.get(r.userToken)
    return {
      ...r,
      isRecovery: !!claim,
      claimedPseudo: claim?.claimedPseudo ?? null,
      recoveryClaimId: claim?.id ?? null,
    }
  })
}

// Valide la 1re livraison : supprime UNIQUEMENT la vidéo du Blob et marque "validated".
// La photo est conservée et reste accessible à la demande depuis le panel admin.
export async function validateAndPurge(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const rows = await db.select().from(userVerifications).where(eq(userVerifications.id, id)).limit(1)
  const row = rows[0]
  if (!row) return { ok: false as const, error: "Introuvable." }

  // Suppression de la vidéo uniquement (best-effort) ; la photo est conservée.
  if (row.videoPathname) {
    try {
      await del(row.videoPathname)
    } catch (err) {
      console.log("[v0] del blob error:", err)
    }
  }

  await db
    .update(userVerifications)
    .set({
      status: "validated",
      videoPathname: null,
      validatedAt: new Date(),
    })
    .where(eq(userVerifications.id, id))

  // Si récupération de compte : tenter la fusion auto
  try {
    const { listRecoveryClaims, approveRecoveryClaim } = await import("@/app/actions/lost-key")
    const claims = await listRecoveryClaims()
    const claim = claims.find(
      (c) =>
        c.provisionalToken === row.userToken &&
        (c.status === "kyc_submitted" || c.status === "pending_kyc"),
    )
    if (claim) {
      const merge = await approveRecoveryClaim(claim.id, claim.originalUserId)
      if (!merge.ok) {
        // KYC validé mais fusion manuelle requise — on laisse le dossier ouvert
        console.log("[recovery] merge deferred:", merge.error)
      }
    }
  } catch (e) {
    console.log("[recovery] merge error:", e)
  }

  revalidatePath("/admin")
  return { ok: true as const }
}

// Refuse la vérification : supprime les fichiers Blob, efface l'enregistrement (reset complet),
// et envoie un message au client lui demandant de recommencer avec la justification.
export async function rejectVerification(id: number, justification: string) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const rows = await db.select().from(userVerifications).where(eq(userVerifications.id, id)).limit(1)
  const row = rows[0]
  if (!row) return { ok: false as const, error: "Introuvable." }

  // Suppression des fichiers Blob
  for (const path of [row.photoPathname, row.videoPathname]) {
    if (path) {
      try { await del(path) } catch { /* best-effort */ }
    }
  }

  // Supprime l'enregistrement pour que le client puisse en soumettre un nouveau
  await db.delete(userVerifications).where(eq(userVerifications.id, id))

  // Si récupération : reset claim en pending_kyc (peut resoumettre) sauf refus global
  try {
    const { listRecoveryClaims } = await import("@/app/actions/lost-key")
    const { db: dbi } = await import("@/lib/db")
    const { accountRecoveryClaims } = await import("@/lib/db/schema")
    const { eq: eq2 } = await import("drizzle-orm")
    const claims = await listRecoveryClaims()
    const claim = claims.find((c) => c.provisionalToken === row.userToken)
    if (claim && claim.status !== "rejected" && claim.status !== "approved") {
      await dbi
        .update(accountRecoveryClaims)
        .set({ status: "pending_kyc" })
        .where(eq2(accountRecoveryClaims.id, claim.id))
    }
  } catch {
    /* ignore */
  }

  // Crée un fil de discussion et envoie le message de refus côté vendeur
  const pseudo = row.pseudo ?? "Client"
  const motif = justification.trim()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.breakingbad33.com"
  const verifLink = `${siteUrl}/verification`
  const vendeurBody = `Ta vérification d'identité a été refusée.\n\nMotif : ${motif}\n\nPour soumettre une nouvelle vérification, clique sur ce lien :\n${verifLink}\n\nSi tu as des questions, réponds à ce message.`

  const thread = await createGeneralInquiryThread({
    customerName: pseudo,
    customerToken: row.userToken,
    message: `Refus de vérification — ${pseudo}`,
  })

  if (thread.ok && thread.id) {
    await addMessage(thread.id, "vendeur", vendeurBody)
  }

  revalidatePath("/admin")
  return { ok: true as const }
}

// Supprime définitivement la photo de vérification (et la vidéo si encore présente).
export async function deleteVerificationPhoto(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const rows = await db.select().from(userVerifications).where(eq(userVerifications.id, id)).limit(1)
  const row = rows[0]
  if (!row) return { ok: false as const, error: "Introuvable." }

  for (const path of [row.photoPathname, row.videoPathname]) {
    if (path) {
      try {
        await del(path)
      } catch (err) {
        console.log("[v0] del blob error:", err)
      }
    }
  }

  await db
    .update(userVerifications)
    .set({ photoPathname: null, videoPathname: null })
    .where(eq(userVerifications.id, id))

  revalidatePath("/admin")
  return { ok: true as const }
}
