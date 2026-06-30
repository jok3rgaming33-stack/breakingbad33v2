"use server"

import { db } from "@/lib/db"
import { userVerifications, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyVendor } from "@/lib/push"

// Indique si un client doit encore réaliser sa vérification d'identité.
// La vérification est exigée une seule fois (à la 1re commande) : tant
// qu'aucun enregistrement n'existe pour ce token, elle est requise.
export async function needsVerification(token: string | undefined | null): Promise<boolean> {
  const t = token?.trim()
  if (!t) return false
  const rows = await db
    .select({ id: userVerifications.id })
    .from(userVerifications)
    .where(eq(userVerifications.userToken, t))
    .limit(1)
  return rows.length === 0
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

  await notifyVendor({
    title: "Vérification d'identité",
    body: `${pseudo ?? "Un client"} a soumis sa vérification (1re commande).`,
    url: "/admin",
    tag: "verification",
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
  return rows
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
