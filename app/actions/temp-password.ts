"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer, notifyVendor } from "@/lib/push"
import { revalidatePath } from "next/cache"

const VALIDITY_MS = 6 * 60 * 60 * 1000 // 6 heures

function hashPassword(plain: string): string {
  return crypto.createHash("sha256").update(plain + process.env.TEMP_PASS_SALT ?? "bb33salt").digest("hex")
}

function generateTempPassword(): string {
  // 8 caractères alphanumériques lisibles (sans 0/O/I/l pour éviter les confusions)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => chars[b % chars.length])
    .join("")
}

// ─── Admin : envoie un mot de passe provisoire à un client (par son token) ──────────────────
export async function sendTempPassword(customerToken: string): Promise<{
  ok: boolean
  tempPassword?: string
  error?: string
}> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(users).where(eq(users.token, customerToken)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Client introuvable." }

  const tempPassword = generateTempPassword()
  const hash = hashPassword(tempPassword)
  const expires = new Date(Date.now() + VALIDITY_MS)

  await db.update(users).set({
    tempPasswordHash: hash,
    tempPasswordExpires: expires,
    tempPasswordBlocked: false,
  }).where(eq(users.token, customerToken))

  // Notifie le client en push (priorité haute — il doit absolument le voir)
  await notifyCustomer(customerToken, {
    title: "BreakingBad33 — Acces temporaire",
    body: `Ton mot de passe provisoire est pret. Ouvre l'app pour le recuperer. Valable 6h.`,
    url: "/",
    tag: "temp-password",
  })

  revalidatePath("/admin")
  return { ok: true, tempPassword }
}

// ─── Client : récupère son mot de passe provisoire (affiché une seule fois) ─────────────────
// Appelé depuis le formulaire "clé perdue" — on vérifie pseudo + token connu OU pseudo seul
// si l'admin a envoyé le mot de passe sur un fil de discussion identifié.
export async function getTempPasswordStatus(customerToken: string): Promise<{
  hasTempPassword: boolean
  isBlocked: boolean
  isExpired: boolean
}> {
  const rows = await db.select({
    tempPasswordHash: users.tempPasswordHash,
    tempPasswordExpires: users.tempPasswordExpires,
    tempPasswordBlocked: users.tempPasswordBlocked,
  }).from(users).where(eq(users.token, customerToken)).limit(1)

  const u = rows[0]
  if (!u || !u.tempPasswordHash) return { hasTempPassword: false, isBlocked: false, isExpired: false }

  const isExpired = u.tempPasswordExpires ? u.tempPasswordExpires < new Date() : false
  return {
    hasTempPassword: true,
    isBlocked: u.tempPasswordBlocked,
    isExpired,
  }
}

// ─── Client : connexion avec le mot de passe provisoire ──────────────────────────────────────
export async function loginWithTempPassword(pseudo: string, tempPassword: string): Promise<{
  ok: boolean
  token?: string
  error?: string
  needsNewPassword?: boolean
}> {
  const p = pseudo.trim()
  const pw = tempPassword.trim()
  if (!p || !pw) return { ok: false, error: "Identifiants requis." }

  const rows = await db.select().from(users).where(eq(users.pseudo, p)).limit(1)
  const user = rows[0]
  if (!user || !user.tempPasswordHash) return { ok: false, error: "Aucun accès provisoire trouvé pour ce pseudo." }

  // Vérifie si expiré
  const isExpired = user.tempPasswordExpires ? user.tempPasswordExpires < new Date() : true

  if (isExpired) {
    // Signale la tentative au vendeur si pas encore bloqué
    if (!user.tempPasswordBlocked) {
      await db.update(users).set({ tempPasswordBlocked: true }).where(eq(users.id, user.id))
      await notifyVendor({
        title: "Tentative de connexion — Acces expire",
        body: `${user.pseudo} a tente de se connecter avec un mot de passe provisoire expire.`,
        url: "/admin",
        tag: `temp-expired-${user.id}`,
      })
    }
    return { ok: false, error: "Ce mot de passe provisoire a expiré. Contacte le chimiste pour débloquer ton accès." }
  }

  if (user.tempPasswordBlocked) {
    return { ok: false, error: "Ton accès est bloqué. Contacte le chimiste pour le débloquer." }
  }

  const hash = hashPassword(pw)
  if (hash !== user.tempPasswordHash) return { ok: false, error: "Mot de passe provisoire incorrect." }

  // Connexion réussie — notifie le vendeur
  await notifyVendor({
    title: "Connexion provisoire reussie",
    body: `${user.pseudo} s'est connecte avec son mot de passe provisoire.`,
    url: "/admin",
    tag: `temp-login-${user.id}`,
  })

  return { ok: true, token: user.token, needsNewPassword: true }
}

// ─── Client : définit un nouveau mot de passe définitif (= nouveau token) ────────────────────
// Le "mot de passe" client c'est son token secret. On génère un nouveau token,
// on met à jour la base et on efface le mot de passe provisoire.
export async function setNewClientToken(currentToken: string, newToken: string, confirmToken: string): Promise<{
  ok: boolean
  error?: string
}> {
  if (!newToken || newToken !== confirmToken) return { ok: false, error: "Les deux saisies ne correspondent pas." }
  if (newToken.length < 20) return { ok: false, error: "La clé doit faire au moins 20 caractères." }

  const rows = await db.select().from(users).where(eq(users.token, currentToken)).limit(1)
  const user = rows[0]
  if (!user) return { ok: false, error: "Session invalide." }

  // Vérifie que le nouveau token n'est pas déjà utilisé
  const taken = await db.select({ id: users.id }).from(users).where(eq(users.token, newToken)).limit(1)
  if (taken.length > 0) return { ok: false, error: "Cette clé est déjà utilisée." }

  await db.update(users).set({
    token: newToken,
    tempPasswordHash: null,
    tempPasswordExpires: null,
    tempPasswordBlocked: false,
  }).where(eq(users.id, user.id))

  // Notifie le vendeur
  await notifyVendor({
    title: "Nouveau mot de passe defini",
    body: `${user.pseudo} a defini une nouvelle cle secrete et s'est reconnecte.`,
    url: "/admin",
    tag: `new-token-${user.id}`,
  })

  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : débloque l'accès d'un client dont le mot de passe provisoire a expiré ──────────
export async function unblockTempPassword(customerToken: string): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }

  // Génère un nouveau mot de passe provisoire frais (6h)
  const tempPassword = generateTempPassword()
  const hash = hashPassword(tempPassword)
  const expires = new Date(Date.now() + VALIDITY_MS)

  await db.update(users).set({
    tempPasswordHash: hash,
    tempPasswordExpires: expires,
    tempPasswordBlocked: false,
  }).where(eq(users.token, customerToken))

  await notifyCustomer(customerToken, {
    title: "BreakingBad33 — Acces debloque",
    body: "Ton acces a ete debloque. Un nouveau mot de passe provisoire t'attend dans l'app. Valable 6h.",
    url: "/",
    tag: "temp-password-unblock",
  })

  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : lit la liste des clients avec un accès bloqué ───────────────────────────────────
export async function getBlockedTempPasswords() {
  if (!(await isAdminAuthenticated())) return []
  return db.select({
    id: users.id,
    token: users.token,
    pseudo: users.pseudo,
    tempPasswordExpires: users.tempPasswordExpires,
  }).from(users).where(eq(users.tempPasswordBlocked, true))
}
