"use server"

/**
 * Flux complet « Clé perdue » :
 * 1. Compte provisoire + clé secrète générée
 * 2. Fil messagerie lié au token (client voit les réponses admin)
 * 3. KYC obligatoire
 * 4. Validation admin → fusion compte d'origine + token provisoire = nouvelle clé
 */

import { db } from "@/lib/db"
import {
  users,
  orderThreads,
  threadMessages,
  loyaltyCodes,
  userVerifications,
  promoUsages,
  userNewsReads,
  pushSubscriptions,
  restockAlerts,
  loginLogs,
  notificationReads,
  reservedPseudos,
  accountRecoveryClaims,
} from "@/lib/db/schema"
import { eq, and, inArray, desc, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyVendor } from "@/lib/push"
import { del } from "@vercel/blob"

export type RecoveryClaimRow = {
  id: number
  provisionalToken: string
  claimedPseudo: string
  originalUserId: number | null
  originalPseudo: string | null
  threadId: number | null
  status: string
  clientMessage: string | null
  adminNote: string | null
  createdAt: string
  kycStatus: string | null
}

function generateSecretKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  let key = Buffer.from(array)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  if (key.length < 30) key = key + generateSecretKey()
  return key.slice(0, 64)
}

/** Crée la table si absente (pas de migrate drizzle en prod). */
export async function ensureRecoverySchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_recovery_claims (
      id SERIAL PRIMARY KEY,
      provisional_token TEXT NOT NULL UNIQUE,
      claimed_pseudo TEXT NOT NULL,
      original_user_id INTEGER,
      thread_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending_kyc',
      client_message TEXT,
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `)
}

/**
 * Client : demande « clé perdue ».
 * Retourne une clé provisoire pour se connecter tout de suite + id fil messagerie.
 */
export async function submitLostKeyClaim(input: {
  claimedPseudo: string
  message?: string
}): Promise<
  | {
      ok: true
      provisionalToken: string
      provisionalPseudo: string
      threadId: number
      claimId: number
    }
  | { ok: false; error: string }
> {
  await ensureRecoverySchema()

  const claimedPseudo = input.claimedPseudo?.trim()
  if (!claimedPseudo) {
    return { ok: false, error: "Indique le pseudo du compte à récupérer." }
  }

  // Compte d'origine possible (aide admin)
  const originals = await db
    .select({ id: users.id, pseudo: users.pseudo, token: users.token })
    .from(users)
    .where(eq(users.pseudo, claimedPseudo))
    .limit(5)

  // Ne pas créer de provisoire si le pseudo n'existe pas du tout (évite spam)
  // Mais un client peut mal orthographier — on accepte quand même et l'admin tranche.
  // On pré-remplit originalUserId s'il y a un match unique.
  const originalUserId = originals.length === 1 ? originals[0].id : null

  const provisionalToken = generateSecretKey()
  // Pseudo provisoire unique pour éviter collision reserved_pseudos
  const provisionalPseudo = `recup_${claimedPseudo}`.slice(0, 40)
  let finalPseudo = provisionalPseudo
  // Si collision, suffixe aléatoire
  const taken = await db
    .select({ id: reservedPseudos.id })
    .from(reservedPseudos)
    .where(eq(reservedPseudos.pseudo, finalPseudo))
    .limit(1)
  if (taken.length > 0) {
    finalPseudo = `recup_${claimedPseudo.slice(0, 20)}_${Date.now().toString(36)}`.slice(0, 40)
  }

  await db.insert(reservedPseudos).values({ pseudo: finalPseudo }).onConflictDoNothing()
  await db.insert(users).values({
    token: provisionalToken,
    pseudo: finalPseudo,
    flags: ["lost_key_provisional", "pending_identity"],
    nickname: `CLAIM:${claimedPseudo}`,
  })

  // Fil de discussion lié au token provisoire
  const msgBody =
    `[CLE PERDUE / RÉCUPÉRATION]\n` +
    `Pseudo déclaré : ${claimedPseudo}\n` +
    `Compte provisoire : ${finalPseudo}\n\n` +
    (input.message?.trim() || "Le client a perdu sa clé et demande de récupérer son compte.") +
    `\n\n—\nLe client est connecté avec une clé provisoire et peut lire tes réponses ici.\n` +
    `Il doit passer le KYC. Ensuite valide la récupération dans Vérifications / Récupérations.`

  const trackingToken = `MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: finalPseudo,
      customerToken: provisionalToken,
      trackingToken,
      summary: `Clé perdue — ${claimedPseudo}`,
      total: 0,
      fulfillment: "livraison",
      status: "discussion",
    })
    .returning()

  await db.insert(threadMessages).values({
    threadId: thread.id,
    sender: "client",
    body: msgBody,
  })

  // Message auto vendeur : KYC immédiat + messagerie 2 sens
  await db.insert(threadMessages).values({
    threadId: thread.id,
    sender: "vendeur",
    body:
      `Bien reçu pour « ${claimedPseudo} ».\n\n` +
      `1) Fais ton KYC maintenant (selfie + courte vidéo) — le vendeur valide en direct.\n` +
      `2) Écris-moi ici pour toute question : je peux te répondre tout de suite.\n\n` +
      `Après validation, commandes, messages et fidélité sont rattachés ; cette clé provisoire devient ta clé définitive.`,
  })

  const [claim] = await db
    .insert(accountRecoveryClaims)
    .values({
      provisionalToken,
      claimedPseudo,
      originalUserId,
      threadId: thread.id,
      status: "pending_kyc",
      clientMessage: input.message?.trim() || null,
    })
    .returning()

  await notifyVendor({
    title: "Clé perdue — récupération",
    body: `${claimedPseudo} a ouvert un dossier (compte provisoire ${finalPseudo}). KYC à valider.`,
    url: "/admin",
    tag: `recovery-${claim.id}`,
  })

  revalidatePath("/admin")
  revalidatePath("/messagerie")

  return {
    ok: true,
    provisionalToken,
    provisionalPseudo: finalPseudo,
    threadId: thread.id,
    claimId: claim.id,
  }
}

/** Client connecté : statut de sa récupération en cours. */
export async function getMyRecoveryStatus(token: string): Promise<{
  active: boolean
  status: string | null
  claimedPseudo: string | null
  needsKyc: boolean
  claimId: number | null
} | null> {
  const t = token?.trim()
  if (!t) return null
  await ensureRecoverySchema()
  try {
    const rows = await db
      .select()
      .from(accountRecoveryClaims)
      .where(eq(accountRecoveryClaims.provisionalToken, t))
      .orderBy(desc(accountRecoveryClaims.createdAt))
      .limit(1)
    const c = rows[0]
    if (!c) return { active: false, status: null, claimedPseudo: null, needsKyc: false, claimId: null }
    if (c.status === "approved" || c.status === "rejected") {
      return {
        active: false,
        status: c.status,
        claimedPseudo: c.claimedPseudo,
        needsKyc: false,
        claimId: c.id,
      }
    }
    return {
      active: true,
      status: c.status,
      claimedPseudo: c.claimedPseudo,
      needsKyc: c.status === "pending_kyc",
      claimId: c.id,
    }
  } catch {
    return { active: false, status: null, claimedPseudo: null, needsKyc: false, claimId: null }
  }
}

/** Marque le claim en kyc_submitted après upload KYC. */
export async function markRecoveryKycSubmitted(provisionalToken: string) {
  await ensureRecoverySchema()
  const t = provisionalToken?.trim()
  if (!t) return
  await db
    .update(accountRecoveryClaims)
    .set({ status: "kyc_submitted" })
    .where(
      and(
        eq(accountRecoveryClaims.provisionalToken, t),
        inArray(accountRecoveryClaims.status, ["pending_kyc", "kyc_submitted"]),
      ),
    )
}

export async function listRecoveryClaims(): Promise<RecoveryClaimRow[]> {
  if (!(await isAdminAuthenticated())) return []
  await ensureRecoverySchema()
  const rows = await db
    .select()
    .from(accountRecoveryClaims)
    .orderBy(desc(accountRecoveryClaims.createdAt))
    .limit(100)

  const result: RecoveryClaimRow[] = []
  for (const r of rows) {
    let originalPseudo: string | null = null
    if (r.originalUserId) {
      const o = await db
        .select({ pseudo: users.pseudo })
        .from(users)
        .where(eq(users.id, r.originalUserId))
        .limit(1)
      originalPseudo = o[0]?.pseudo ?? null
    }
    let kycStatus: string | null = null
    const kyc = await db
      .select({ status: userVerifications.status })
      .from(userVerifications)
      .where(eq(userVerifications.userToken, r.provisionalToken))
      .limit(1)
    kycStatus = kyc[0]?.status ?? null

    result.push({
      id: r.id,
      provisionalToken: r.provisionalToken,
      claimedPseudo: r.claimedPseudo,
      originalUserId: r.originalUserId,
      originalPseudo,
      threadId: r.threadId,
      status: r.status,
      clientMessage: r.clientMessage,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      kycStatus,
    })
  }
  return result
}

/** Admin : associe manuellement un user d'origine (par id) au claim. */
export async function setRecoveryOriginalUser(
  claimId: number,
  originalUserId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  await ensureRecoverySchema()
  const u = await db.select().from(users).where(eq(users.id, originalUserId)).limit(1)
  if (!u[0]) return { ok: false, error: "Utilisateur d'origine introuvable." }
  await db
    .update(accountRecoveryClaims)
    .set({ originalUserId })
    .where(eq(accountRecoveryClaims.id, claimId))
  revalidatePath("/admin")
  return { ok: true }
}

/**
 * Admin : valide la récupération après KYC.
 * Fusionne les données du compte d'origine vers le token provisoire
 * (qui devient la clé permanente). Supprime l'ancien user.
 */
export async function approveRecoveryClaim(
  claimId: number,
  originalUserId?: number | null,
): Promise<{ ok: true; newToken: string } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  await ensureRecoverySchema()

  const claims = await db
    .select()
    .from(accountRecoveryClaims)
    .where(eq(accountRecoveryClaims.id, claimId))
    .limit(1)
  const claim = claims[0]
  if (!claim) return { ok: false, error: "Dossier introuvable." }
  if (claim.status === "approved") return { ok: false, error: "Déjà validé." }
  if (claim.status === "rejected") return { ok: false, error: "Dossier refusé." }

  const targetId = originalUserId ?? claim.originalUserId
  if (!targetId) {
    // Essayer match pseudo
    const byPseudo = await db
      .select()
      .from(users)
      .where(eq(users.pseudo, claim.claimedPseudo))
      .limit(5)
    // Exclure le provisoire
    const candidates = byPseudo.filter((u) => u.token !== claim.provisionalToken)
    if (candidates.length !== 1) {
      return {
        ok: false,
        error:
          candidates.length === 0
            ? "Aucun compte d'origine trouvé pour ce pseudo. Associe un utilisateur manuellement."
            : "Plusieurs comptes avec ce pseudo. Choisis l'ID d'origine.",
      }
    }
    return approveRecoveryClaim(claimId, candidates[0].id)
  }

  const origRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1)
  const original = origRows[0]
  if (!original) return { ok: false, error: "Compte d'origine introuvable." }
  if (original.token === claim.provisionalToken) {
    return { ok: false, error: "Le compte d'origine est le provisoire." }
  }

  const provRows = await db
    .select()
    .from(users)
    .where(eq(users.token, claim.provisionalToken))
    .limit(1)
  const provisional = provRows[0]
  if (!provisional) return { ok: false, error: "Compte provisoire introuvable." }

  const oldToken = original.token
  const newToken = claim.provisionalToken

  // Fusion fidélité
  await db
    .update(users)
    .set({
      loyaltyAdjustment: (provisional.loyaltyAdjustment ?? 0) + (original.loyaltyAdjustment ?? 0),
      loyaltySpent: (provisional.loyaltySpent ?? 0) + (original.loyaltySpent ?? 0),
      pseudo: original.pseudo, // récupère le vrai pseudo
      flags: [],
      nickname: original.nickname,
      mustSetPassword: false,
      accessRestoreToken: null,
      accessRestoreExpires: null,
    })
    .where(eq(users.id, provisional.id))

  // Réaffecter toutes les références token de l'ancien compte vers la clé provisoire (définitive)
  await db
    .update(orderThreads)
    .set({ customerToken: newToken, customerName: original.pseudo })
    .where(eq(orderThreads.customerToken, oldToken))
  await db.update(loyaltyCodes).set({ userToken: newToken }).where(eq(loyaltyCodes.userToken, oldToken))
  await db.update(promoUsages).set({ userToken: newToken }).where(eq(promoUsages.userToken, oldToken))
  await db.update(userNewsReads).set({ userToken: newToken }).where(eq(userNewsReads.userToken, oldToken))
  await db.update(restockAlerts).set({ userToken: newToken }).where(eq(restockAlerts.userToken, oldToken))
  await db.update(loginLogs).set({ userToken: newToken }).where(eq(loginLogs.userToken, oldToken))
  await db
    .update(pushSubscriptions)
    .set({ customerToken: newToken })
    .where(eq(pushSubscriptions.customerToken, oldToken))
  await db
    .update(notificationReads)
    .set({ customerToken: newToken })
    .where(eq(notificationReads.customerToken, oldToken))

  // KYC du provisoire : marquer validé ; supprimer éventuel KYC orphelin de l'ancien token
  await db
    .update(userVerifications)
    .set({ status: "validated", validatedAt: new Date(), pseudo: original.pseudo })
    .where(eq(userVerifications.userToken, newToken))

  // Supprimer l'ancien user (token perdu)
  await db.delete(users).where(eq(users.id, original.id))

  // Message dans le fil
  if (claim.threadId) {
    await db.insert(threadMessages).values({
      threadId: claim.threadId,
      sender: "vendeur",
      body:
        `✅ Récupération validée.\n\n` +
        `Ton compte « ${original.pseudo} » est rattaché. Cette clé provisoire est désormais ta clé définitive.\n` +
        `Commandes, messages et fidélité sont de nouveau disponibles.`,
    })
    await db
      .update(orderThreads)
      .set({ customerName: original.pseudo, updatedAt: new Date() })
      .where(eq(orderThreads.id, claim.threadId))
  }

  await db
    .update(accountRecoveryClaims)
    .set({
      status: "approved",
      originalUserId: targetId,
      resolvedAt: new Date(),
    })
    .where(eq(accountRecoveryClaims.id, claimId))

  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true, newToken }
}

export async function rejectRecoveryClaim(
  claimId: number,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  await ensureRecoverySchema()
  const claims = await db
    .select()
    .from(accountRecoveryClaims)
    .where(eq(accountRecoveryClaims.id, claimId))
    .limit(1)
  const claim = claims[0]
  if (!claim) return { ok: false, error: "Dossier introuvable." }

  const motif = reason.trim() || "Non précisé"

  if (claim.threadId) {
    await db.insert(threadMessages).values({
      threadId: claim.threadId,
      sender: "vendeur",
      body: `❌ Récupération de compte refusée.\n\nMotif : ${motif}\n\nLe compte provisoire reste limité. Contacte le support si besoin.`,
    })
  }

  // Désactive le provisoire (flag banni)
  await db
    .update(users)
    .set({ flags: ["lost_key_rejected", "banni"] })
    .where(eq(users.token, claim.provisionalToken))

  // Purge KYC provisoire
  const kyc = await db
    .select()
    .from(userVerifications)
    .where(eq(userVerifications.userToken, claim.provisionalToken))
    .limit(1)
  if (kyc[0]) {
    for (const path of [kyc[0].photoPathname, kyc[0].videoPathname]) {
      if (path) {
        try {
          await del(path)
        } catch {
          /* ignore */
        }
      }
    }
    await db.delete(userVerifications).where(eq(userVerifications.id, kyc[0].id))
  }

  await db
    .update(accountRecoveryClaims)
    .set({
      status: "rejected",
      adminNote: motif,
      resolvedAt: new Date(),
    })
    .where(eq(accountRecoveryClaims.id, claimId))

  revalidatePath("/admin")
  return { ok: true }
}

/** Recherche users par pseudo pour association manuelle admin. */
export async function searchUsersByPseudo(q: string): Promise<{ id: number; pseudo: string; tokenPreview: string }[]> {
  if (!(await isAdminAuthenticated())) return []
  const query = q?.trim()
  if (!query || query.length < 2) return []
  const rows = await db
    .select({ id: users.id, pseudo: users.pseudo, token: users.token, flags: users.flags })
    .from(users)
    .where(sql`${users.pseudo} ILIKE ${"%" + query + "%"}`)
    .limit(20)
  return rows
    .filter((r) => !(Array.isArray(r.flags) && r.flags.includes("lost_key_provisional")))
    .map((r) => ({
      id: r.id,
      pseudo: r.pseudo,
      tokenPreview: r.token.slice(0, 8) + "…",
    }))
}
