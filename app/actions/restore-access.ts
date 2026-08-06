"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer, notifyVendor } from "@/lib/push"
import { revalidatePath } from "next/cache"
import { validatePassword } from "@/lib/password-rules"
import { orderThreads, threadMessages } from "@/lib/db/schema"

const RESTORE_VALIDITY_MS = 24 * 60 * 60 * 1000 // 24h pour connexion one-time

// ─── Admin : octroie un accès de rétablissement à un client identifié par son token ────────────
// Génère un token one-time, le stocke en base, envoie une push notification (si dispo)
// ET poste le lien directement dans le fil de discussion ouvert (visible même sans push).
export async function grantRestoreAccess(
  customerToken: string,
  appOrigin: string,
  threadId?: number, // fil de discussion actif — on y poste le lien pour garantir la réception
): Promise<{ ok: boolean; restoreUrl?: string; error?: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(users).where(eq(users.token, customerToken)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Client introuvable." }

  // La récupération est une action explicite de réactivation : on retire uniquement
  // les blocages liés à une clé perdue, sans toucher aux autres étiquettes admin.
  const flags = Array.isArray(user.flags)
    ? user.flags.filter((flag) => flag !== "banni" && flag !== "lost_key_rejected")
    : []

  // Token one-time URL-safe (64 chars hex)
  const restoreToken = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + RESTORE_VALIDITY_MS)

  await db.update(users).set({
    accessRestoreToken: restoreToken,
    accessRestoreExpires: expires,
    mustSetPassword: true,
    flags,
  }).where(eq(users.id, user.id))

  const restoreUrl = `${appOrigin}/?restore=${restoreToken}`

  // 1) Push notification (best-effort — le client peut ne pas avoir de subscription active)
  await notifyCustomer(customerToken, {
    title: "BreakingBad33 — Acces retabli",
    body: "Ton acces a ete retabli. Appuie sur cette notification pour te reconnecter et definir ton mot de passe.",
    url: restoreUrl,
    tag: "access-restore",
  }).catch(() => {/* silencieux si pas de sub */})

  // 2) Message dans le fil de discussion — best-effort : la récupération doit
  // rester possible même si un ancien fil est corrompu ou indisponible.
  try {
    const targetThreadId = threadId ?? (await db
      .select({ id: orderThreads.id })
      .from(orderThreads)
      .where(eq(orderThreads.customerToken, customerToken))
      .orderBy(desc(orderThreads.updatedAt))
      .limit(1)
      .then(r => r[0]?.id))

    if (targetThreadId) {
      const msg = `Ton acces a ete retabli par le chimiste.\n\nClique sur ce lien pour te reconnecter et choisir ton nouveau mot de passe :\n\n${restoreUrl}\n\n(Lien valable 24h)`
      await db.insert(threadMessages).values({
        threadId: targetThreadId,
        sender: "vendeur",
        body: msg,
      })
      await db.update(orderThreads)
        .set({ updatedAt: new Date() })
        .where(eq(orderThreads.id, targetThreadId))
    }
  } catch (error) {
    console.log("[v0] Message de récupération indisponible:", error)
  }

  revalidatePath("/admin")
  return { ok: true, restoreUrl }
}

// ─── Admin : état du rétablissement d'accès pour un client ────────────────────────────────────
export async function getRestoreStatus(customerToken: string): Promise<{
  pending: boolean          // lien envoyé mais pas encore utilisé
  expired: boolean          // lien expiré (24h dépassées)
  mustSetPassword: boolean  // lien consommé, mot de passe pas encore défini
  done: boolean             // mot de passe défini — accès rétabli
  expiresAt: string | null  // ISO string pour afficher le délai restant
} | null> {
  if (!(await isAdminAuthenticated())) return null
  const rows = await db.select({
    accessRestoreToken: users.accessRestoreToken,
    accessRestoreExpires: users.accessRestoreExpires,
    mustSetPassword: users.mustSetPassword,
  }).from(users).where(eq(users.token, customerToken)).limit(1)
  const u = rows[0]
  if (!u) return null

  const now = new Date()
  const hasToken = !!u.accessRestoreToken
  const expired = !!u.accessRestoreExpires && u.accessRestoreExpires < now
  const mustSet = u.mustSetPassword

  return {
    pending:         hasToken && !expired && mustSet,   // envoyé, pas encore consulté
    expired:         hasToken && expired && mustSet,    // délai dépassé
    mustSetPassword: mustSet,                           // connecté, mdp non défini
    done:            !hasToken && !mustSet,             // tout bon
    expiresAt:       u.accessRestoreExpires ? u.accessRestoreExpires.toISOString() : null,
  }
}

// ─── Client : connexion via le token de rétablissement (URL ?restore=xxx) ─────────────────────
export async function loginWithRestoreToken(restoreToken: string): Promise<{
  ok: boolean
  userToken?: string
  pseudo?: string
  error?: string
}> {
  const t = restoreToken?.trim()
  if (!t) return { ok: false, error: "Token invalide." }

  const rows = await db.select().from(users).where(eq(users.accessRestoreToken, t)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Ce lien est invalide ou a déjà été utilisé." }

  const expired = user.accessRestoreExpires ? user.accessRestoreExpires < new Date() : true
  if (expired) {
    return { ok: false, error: "Ce lien de rétablissement a expiré. Contacte le chimiste." }
  }

  // La notification est informative : elle ne doit jamais empêcher le client
  // de récupérer son compte si le push vendeur est indisponible.
  await notifyVendor({
    title: "Acces retabli — Connexion client",
    body: `${user.pseudo} a ouvert le lien de retablissement et se reconnecte.`,
    url: "/admin",
    tag: `restore-login-${user.id}`,
  }).catch((error) => {
    console.log("[v0] Notification vendeur indisponible pendant la récupération:", error)
  })

  return { ok: true, userToken: user.token, pseudo: user.pseudo }
}

// ─── Client : définit un nouveau mot de passe après rétablissement ─────────────────────────────
// Le "mot de passe" côté client = son token. On génère un nouveau token qui respecte
// les règles de complexité définies par l'admin (majuscule + chiffre + symbole).
export async function setPasswordAfterRestore(
  currentToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ ok: boolean; newToken?: string; error?: string }> {
  if (!newPassword || newPassword !== confirmPassword) {
    return { ok: false, error: "Les deux saisies ne correspondent pas." }
  }

  const validation = validatePassword(newPassword)
  if (!validation.ok) return { ok: false, error: validation.error }

  const rows = await db.select().from(users).where(eq(users.token, currentToken)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Session invalide." }

  if (!user.mustSetPassword) {
    return { ok: false, error: "Aucune redefinition de mot de passe requise." }
  }

  // Vérifie que le nouveau mot de passe n'est pas déjà utilisé comme token
  const taken = await db.select({ id: users.id }).from(users).where(eq(users.token, newPassword)).limit(1)
  if (taken.length > 0) {
    return { ok: false, error: "Ce mot de passe est déjà utilisé." }
  }

  await db.update(users).set({
    token: newPassword,
    accessRestoreToken: null,
    accessRestoreExpires: null,
    mustSetPassword: false,
    // Purge aussi le mot de passe provisoire si présent
    tempPasswordHash: null,
    tempPasswordExpires: null,
    tempPasswordBlocked: false,
  }).where(eq(users.id, user.id))

  // La mise à jour DB est la source de vérité : une notification indisponible
  // ne doit pas faire croire au client que sa nouvelle clé n'a pas été enregistrée.
  await notifyVendor({
    title: "Nouveau mot de passe defini",
    body: `${user.pseudo} a defini son nouveau mot de passe et est reconnecte.`,
    url: "/admin",
    tag: `password-set-${user.id}`,
  }).catch((error) => {
    console.log("[v0] Notification vendeur indisponible après récupération:", error)
  })

  revalidatePath("/admin")
  return { ok: true, newToken: newPassword }
}
