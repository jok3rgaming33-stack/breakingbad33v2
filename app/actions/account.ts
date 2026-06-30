"use server"

import { db } from "@/lib/db"
import { users, orderThreads, accountCreations } from "@/lib/db/schema"
import { eq, desc, sql, and, gte } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isClosedStatus, normalizeStatus } from "@/lib/order-status"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { notifyVendor } from "@/lib/push"
import { getClientIp, isVpnOrProxy } from "@/lib/ip-check"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

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
export async function getAccount(token: string) {
  const t = token?.trim()
  if (!t) return null
  const rows = await db.select().from(users).where(eq(users.token, t)).limit(1)
  return rows[0] ?? null
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
  createdAt: Date | string
  orderCount: number
  totalSpent: number
  loyaltyAdjustment: number
  flags: string[]
}

// Étiquettes possibles posées par l'admin sur un compte client.
export const USER_FLAGS = ["absent", "suspect", "fidele", "banni"] as const
export type UserFlag = (typeof USER_FLAGS)[number]

// Répertoire de tous les comptes enregistrés, avec nombre de commandes et total dépensé.
export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      pseudo: users.pseudo,
      token: users.token,
      createdAt: users.createdAt,
      loyaltyAdjustment: users.loyaltyAdjustment,
      flags: users.flags,
      orderCount: sql<number>`count(${orderThreads.id})::int`,
      totalSpent: sql<number>`coalesce(sum(${orderThreads.total}), 0)::int`,
    })
    .from(users)
    .leftJoin(orderThreads, eq(orderThreads.customerToken, users.token))
    .groupBy(users.id, users.pseudo, users.token, users.createdAt, users.loyaltyAdjustment, users.flags)
    .orderBy(desc(users.createdAt))
  return rows
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

// Supprime un compte. Les commandes liées ne sont pas effacées (historique conservé),
// elles deviennent simplement orphelines de compte.
export async function deleteUserAccount(id: number) {
  if (!id) return { ok: false as const }
  await db.delete(users).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}
