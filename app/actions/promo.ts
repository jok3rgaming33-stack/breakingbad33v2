"use server"

import { db } from "@/lib/db"
import { promoCodes, loyaltyCodes, users, type PromoCode, type LoyaltyCode } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getCustomerStats } from "@/app/actions/account"
import { LOYALTY_REWARDS } from "@/lib/loyalty"
import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, sql } from "drizzle-orm"

// Forme renvoyée au panier lorsqu'un code est validé.
export type ValidatedPromo = {
  code: string
  type: "percent" | "fixed"
  value: number
  minAmount: number
}

// --- Codes promo globaux (admin) ---

export async function listPromoCodes(): Promise<PromoCode[]> {
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt))
}

export async function savePromoCode(input: {
  id?: number
  code: string
  type: "percent" | "fixed"
  value: number
  minAmount?: number
  active?: boolean
}) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const code = input.code?.trim().toUpperCase()
  if (!code) return { ok: false as const, error: "Code requis" }
  const values = {
    code,
    type: input.type === "percent" ? "percent" : "fixed",
    value: Math.max(0, Math.trunc(Number(input.value) || 0)),
    minAmount: Math.max(0, Math.trunc(Number(input.minAmount) || 0)),
    active: input.active ?? true,
  }
  try {
    if (input.id) {
      await db.update(promoCodes).set(values).where(eq(promoCodes.id, input.id))
    } else {
      await db.insert(promoCodes).values(values)
    }
  } catch {
    return { ok: false as const, error: "Ce code existe déjà." }
  }
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function deletePromoCode(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  if (!id) return { ok: false as const }
  await db.delete(promoCodes).where(eq(promoCodes.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}

// --- Codes de fidélité (client) ---

function makeCode(discount: number) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `BB33-${discount}E-${random}`
}

// Génère un code de réduction en débitant réellement les points du client.
export async function generateLoyaltyCode(token: string, points: number) {
  const t = token?.trim()
  if (!t) return { ok: false as const, error: "Session invalide" }

  const reward = LOYALTY_REWARDS.find((r) => r.points === points)
  if (!reward) return { ok: false as const, error: "Récompense inconnue" }

  // Vérifie le solde réel (commandes livrées + ajustement - déjà dépensés).
  const stats = await getCustomerStats(t)
  if (stats.points < reward.points) return { ok: false as const, error: "Points insuffisants" }

  // Débite les points et enregistre le code.
  await db
    .update(users)
    .set({ loyaltySpent: sql`${users.loyaltySpent} + ${reward.points}` })
    .where(eq(users.token, t))

  const code = makeCode(reward.discount)
  await db.insert(loyaltyCodes).values({
    userToken: t,
    code,
    discount: reward.discount,
    pointsCost: reward.points,
    minAmount: reward.minAmount,
  })

  revalidatePath("/")
  return { ok: true as const, code, remaining: stats.points - reward.points }
}

// Liste les codes générés par un client ("Mes codes").
export async function listLoyaltyCodes(token: string): Promise<LoyaltyCode[]> {
  const t = token?.trim()
  if (!t) return []
  return db.select().from(loyaltyCodes).where(eq(loyaltyCodes.userToken, t)).orderBy(desc(loyaltyCodes.createdAt))
}

// --- Validation d'un code saisi dans le panier ---
// Accepte un code promo global OU un code fidélité (usage unique).
export async function validateCode(rawCode: string, subtotal: number, token?: string): Promise<
  { ok: true; promo: ValidatedPromo } | { ok: false; error: string }
> {
  const code = rawCode?.trim().toUpperCase()
  if (!code) return { ok: false, error: "Code vide" }

  // 1) Code promo global
  const promo = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1)
  if (promo[0]) {
    const p = promo[0]
    if (!p.active) return { ok: false, error: "Ce code n'est plus actif." }
    if (subtotal < p.minAmount) return { ok: false, error: `Minimum ${p.minAmount}€ d'achat requis.` }
    return { ok: true, promo: { code: p.code, type: p.type as "percent" | "fixed", value: p.value, minAmount: p.minAmount } }
  }

  // 2) Code fidélité (usage unique)
  const loyalty = await db.select().from(loyaltyCodes).where(eq(loyaltyCodes.code, code)).limit(1)
  if (loyalty[0]) {
    const l = loyalty[0]
    if (l.used) return { ok: false, error: "Ce code a déjà été utilisé." }
    if (token && l.userToken !== token.trim()) return { ok: false, error: "Ce code ne t'appartient pas." }
    if (subtotal < l.minAmount) return { ok: false, error: `Minimum ${l.minAmount}€ d'achat requis.` }
    return { ok: true, promo: { code: l.code, type: "fixed", value: l.discount, minAmount: l.minAmount } }
  }

  return { ok: false, error: "Code invalide." }
}

// Marque un code fidélité comme utilisé (au moment de la validation de commande).
export async function markLoyaltyCodeUsed(code: string) {
  const c = code?.trim().toUpperCase()
  if (!c) return { ok: false as const }
  await db.update(loyaltyCodes).set({ used: true }).where(and(eq(loyaltyCodes.code, c), eq(loyaltyCodes.used, false)))
  return { ok: true as const }
}
