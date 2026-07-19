"use server"

import { db } from "@/lib/db"
import {
  users, orderThreads, threadMessages, accountCreations,
  userVerifications, loyaltyCodes, promoUsages, userNewsReads,
  pushSubscriptions, restockAlerts,
} from "@/lib/db/schema"
import { eq, desc, sql, and, gte, inArray } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { isClosedStatus, normalizeStatus } from "@/lib/order-status"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { notifyVendor } from "@/lib/push"
import { getClientIp, isVpnOrProxy } from "@/lib/ip-check"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { USER_FLAGS } from "@/lib/user-flags"
import { recordLogin, deleteLoginLogsByToken } from "@/app/actions/login-logs"

// Crée (ou réenregistre) un compte anonyme : associe une clé secrète à un pseudo.
// Idempotent : si la clé existe déjà, on conserve le pseudo d'origine.
// Applique une limite d'1 création par mois et par IP, et bloque les VPN/proxies.
export async function createAccount(token: string, pseudo: string) {
  const t = token?.trim()
  const p = pseudo?.trim()
  if (!t || t.length < 20 || !p) return { ok: false as const, error: "Paramètres invalides." }

  const existing = await db.select().from(users).where(eq(users.token, t)).limit(1)
  if (existing.length > 0) {
    return { ok: true as const, pseudo: existing[0].pseudo }
  }

  // --- Contrôles anti-comptes multiples (uniquement pour un NOUVEAU compte) ---
  const ip = await getClientIp()

  // 1) Blocage des VPN / proxies.
  if (await isVpnOrProxy(ip)) {
    return {
      ok: false as const,
      error:
        "La création de compte via VPN ou proxy n'est pas autorisée. Désactive-le puis réessaie.",
    }
  }

  // 2) Limite d'un compte par mois et par IP.
  if (ip) {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recent = await db
      .select({ id: accountCreations.id })
      .from(accountCreations)
      .where(and(eq(accountCreations.ip, ip), gte(accountCreations.createdAt, monthAgo)))
      .limit(1)
    if (recent.length > 0) {
      return {
        ok: false as const,
        error:
          "Un compte a déjà été créé depuis cette connexion ce mois-ci. Une seule création par mois est autorisée.",
      }
    }
  }

  await db.insert(users).values({ token: t, pseudo: p })

  // Journalise l'IP pour faire respecter la limite mensuelle.
  if (ip) {
    await db.insert(accountCreations).values({ ip })
  }

  // Notifie le vendeur de l'arrivée d'un nouveau membre.
  await notifyVendor({
    title: "Nouveau membre",
    body: `${p} vient de créer un compte.`,
    url: "/admin",
    tag: "new-member",
  })

  return { ok: true as const, pseudo: p }
}

// Récupère le compte associé à une clé secrète (connexion d'un client existant).
// Enregistre la connexion dans login_logs (fire-and-forget).
export async function getAccount(token: string) {
  const t = token?.trim()
  if (!t) return null
  const rows = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const account = rows[0] ?? null
  if (account) {
    // Fire-and-forget : ne bloque pas la réponse
    recordLogin(t).catch(() => {})
  }
  return account
}

// Garantit qu'un compte existe pour cette clé (migration des anciens comptes
// créés uniquement en localStorage avant l'introduction de la table users).
export async function ensureAccount(token: string, fallbackPseudo: string) {
  const account = await getAccount(token)
  if (account) return { ok: true as const, pseudo: account.pseudo, created: false }
  const res = await createAccount(token, fallbackPseudo)
  if (!res.ok) return { ok: false as const, error: res.error }
  return { ok: true as const, pseudo: res.pseudo, created: true }
}

// Statistiques réelles du client, calculées depuis ses commandes (clé secrète).
export async function getCustomerStats(token: string) {
  const t = token?.trim()
  if (!t) return { points: 0, active: 0, past: 0 }

  const rows = await db.select().from(orderThreads).where(eq(orderThreads.customerToken, t))

  let points = 0
  let active = 0
  let past = 0
  for (const row of rows) {
    // Les points ne sont crédités QU'À la livraison (statut "livree").
    if (normalizeStatus(row.status) === "livree") {
      points += computeLoyaltyPoints(row.total ?? 0)
    }
    if (isClosedStatus(row.status)) past += 1
    else active += 1
  }

  // Ajustement manuel du vendeur, moins les points déjà dépensés en codes.
  // Les points ne descendent jamais sous 0.
  const account = await db.select().from(users).where(eq(users.token, t)).limit(1)
  points = Math.max(0, points + (account[0]?.loyaltyAdjustment ?? 0) - (account[0]?.loyaltySpent ?? 0))

  return { points, active, past }
}

// --- Administration des comptes (réservé au panel admin) ---

export type AdminUserRow = {
  id: number
  pseudo: string
  token: string
  // Surnom interne admin uniquement — jamais exposé côté client.
  nickname: string | null
  createdAt: Date | string
  orderCount: number
  totalSpent: number
  loyaltyAdjustment: number
  flags: string[]
}

// Répertoire de tous les comptes enregistrés, avec nombre de commandes et total dépensé.
export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      pseudo: users.pseudo,
      token: users.token,
      nickname: users.nickname,
      createdAt: users.createdAt,
      loyaltyAdjustment: users.loyaltyAdjustment,
      flags: users.flags,
      orderCount: sql<number>`count(${orderThreads.id})::int`,
      totalSpent: sql<number>`coalesce(sum(${orderThreads.total}), 0)::int`,
    })
    .from(users)
    .leftJoin(orderThreads, eq(orderThreads.customerToken, users.token))
    .groupBy(users.id, users.pseudo, users.token, users.nickname, users.createdAt, users.loyaltyAdjustment, users.flags)
    .orderBy(desc(users.createdAt))
  return rows
}

// Définit le surnom interne d'un compte (visible uniquement de l'admin).
export async function setUserNickname(id: number, nickname: string) {
  if (!id) return { ok: false as const }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const value = nickname.trim().slice(0, 60) || null
  await db.update(users).set({ nickname: value }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, nickname: value }
}

// Met à jour les étiquettes (flags) d'un compte client (réservé admin).
export async function setUserFlags(id: number, flags: string[]) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const clean = Array.from(new Set(flags.filter((f) => (USER_FLAGS as readonly string[]).includes(f))))
  await db.update(users).set({ flags: clean }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, flags: clean }
}

// Définit l'ajustement manuel des points fidélité d'un compte (réservé admin).
export async function setLoyaltyAdjustment(id: number, adjustment: number) {
  if (!id || !Number.isFinite(adjustment)) return { ok: false as const }
  const value = Math.trunc(adjustment)
  await db.update(users).set({ loyaltyAdjustment: value }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, loyaltyAdjustment: value }
}

// Supprime un compte et TOUTES les données associées au token (cascade complète).
// Tables purgées : orderThreads + threadMessages, userVerifications (+ Blobs),
// loyaltyCodes, promoUsages, userNewsReads, pushSubscriptions, restockAlerts.
export async function deleteUserAccount(id: number) {
  if (!id) return { ok: false as const }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }

  const row = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!row[0]) return { ok: false as const, error: "Introuvable." }
  const token = row[0].token

  await purgeUserData(token)

  revalidatePath("/admin")
  return { ok: true as const }
}

// Purge complète par token (utilisable aussi en interne, ex. rejectVerification).
export async function purgeUserData(token: string) {
  const t = token?.trim()
  if (!t) return

  // 1. Fichiers Blob de vérification d'identité
  const verifs = await db.select().from(userVerifications).where(eq(userVerifications.userToken, t))
  for (const v of verifs) {
    for (const path of [v.photoPathname, v.videoPathname]) {
      if (path) { try { await del(path) } catch { /* best-effort */ } }
    }
  }

  // 2. Messages de tous les fils de commande du token
  const threads = await db.select({ id: orderThreads.id }).from(orderThreads).where(eq(orderThreads.customerToken, t))
  if (threads.length > 0) {
    const threadIds = threads.map((t) => t.id)
    await db.delete(threadMessages).where(inArray(threadMessages.threadId, threadIds))
    await db.delete(orderThreads).where(eq(orderThreads.customerToken, t))
  }

  // 3. Toutes les autres tables liées au token
  await db.delete(userVerifications).where(eq(userVerifications.userToken, t))
  await db.delete(loyaltyCodes).where(eq(loyaltyCodes.userToken, t))
  await db.delete(promoUsages).where(eq(promoUsages.userToken, t))
  await db.delete(userNewsReads).where(eq(userNewsReads.userToken, t))
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.customerToken, t))
  await db.delete(restockAlerts).where(eq(restockAlerts.userToken, t))

  // 4. Logs de connexion
  await deleteLoginLogsByToken(t)

  // 5. Compte utilisateur
  await db.delete(users).where(eq(users.token, t))
}
