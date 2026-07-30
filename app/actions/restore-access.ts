"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer, notifyVendor } from "@/lib/push"
import { revalidatePath } from "next/cache"

const RESTORE_VALIDITY_MS = 24 * 60 * 60 * 1000 // 24h pour connexion one-time

// Règles de complexité du mot de passe (affiché côté client aussi)
export const PASSWORD_RULES = {
  minLength: 8,
  // Au moins une majuscule, un chiffre, un symbole parmi : - _ / * ù
  pattern: /^(?=.*[A-Z])(?=.*[0-9])(?=.*[-_/*ù]).{8,}$/,
  hint: "8 caractères min. dont une majuscule, un chiffre et un symbole parmi : - _ / * ù",
}

export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (!password || password.length < PASSWORD_RULES.minLength) {
    return { ok: false, error: `Minimum ${PASSWORD_RULES.minLength} caractères.` }
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Au moins une lettre majuscule requise." }
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Au moins un chiffre requis." }
  }
  if (!/[-_/*ù]/.test(password)) {
    return { ok: false, error: "Au moins un symbole parmi : - _ / * ù" }
  }
  return { ok: true }
}

// ─── Admin : octroie un accès de rétablissement à un client identifié par son pseudo ──────────
// Génère un token one-time, le stocke en base et envoie une push notification.
export async function grantRestoreAccess(
  customerToken: string,
  appOrigin: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(users).where(eq(users.token, customerToken)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Client introuvable." }

  // Token one-time URL-safe
  const restoreToken = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + RESTORE_VALIDITY_MS)

  await db.update(users).set({
    accessRestoreToken: restoreToken,
    accessRestoreExpires: expires,
    mustSetPassword: true,
  }).where(eq(users.id, user.id))

  // L'URL de connexion one-time est encodée dans la notification push
  const restoreUrl = `${appOrigin}/?restore=${restoreToken}`

  await notifyCustomer(customerToken, {
    title: "BreakingBad33 — Acces retabli",
    body: "Ton acces a ete retabli. Appuie sur cette notification pour te reconnecter. Tu devras definir un nouveau mot de passe.",
    url: restoreUrl,
    tag: "access-restore",
  })

  revalidatePath("/admin")
  return { ok: true }
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

  // Notifie le vendeur que le client a ouvert la notification et se connecte
  await notifyVendor({
    title: "Acces retabli — Connexion client",
    body: `${user.pseudo} a ouvert le lien de retablissement et se reconnecte.`,
    url: "/admin",
    tag: `restore-login-${user.id}`,
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

  // Notifie le vendeur — nouveau mot de passe défini + reconnexion effective
  await notifyVendor({
    title: "Nouveau mot de passe defini",
    body: `${user.pseudo} a defini son nouveau mot de passe et est reconnecte.`,
    url: "/admin",
    tag: `password-set-${user.id}`,
  })

  revalidatePath("/admin")
  return { ok: true, newToken: newPassword }
}
