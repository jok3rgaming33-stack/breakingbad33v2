"use server"

import { db } from "@/lib/db"
import { productReservations, products, users } from "@/lib/db/schema"
import { and, eq, gt, sql } from "drizzle-orm"
import { ensureFeatureSchema } from "@/lib/feature-schema"
import { getCustomerStats } from "@/app/actions/account"
import { PRODUCT_RESERVE_HOURS } from "@/lib/loyalty"
import { revalidatePath } from "next/cache"

/** Expire les réservations dépassées et libère le statut. */
async function expireStaleReservations() {
  await db.execute(sql`
    UPDATE product_reservations
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < NOW()
  `)
}

/** Stock « visible » = stock DB − réservations actives des autres. */
export async function getAvailableStock(productId: number, forToken?: string): Promise<number> {
  await ensureFeatureSchema()
  await expireStaleReservations()
  const [p] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)).limit(1)
  if (!p) return 0
  const held = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(productReservations)
    .where(
      and(
        eq(productReservations.productId, productId),
        eq(productReservations.status, "active"),
        gt(productReservations.expiresAt, sql`now()`),
      ),
    )
  const heldCount = Number(held[0]?.c ?? 0)
  // La réservation du client lui-même ne bloque pas sa propre vue
  let own = 0
  if (forToken?.trim()) {
    const mine = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(productReservations)
      .where(
        and(
          eq(productReservations.productId, productId),
          eq(productReservations.userToken, forToken.trim()),
          eq(productReservations.status, "active"),
          gt(productReservations.expiresAt, sql`now()`),
        ),
      )
    own = Number(mine[0]?.c ?? 0)
  }
  return Math.max(0, (p.stock ?? 0) - heldCount + own)
}

export async function getMyReservation(productId: number, token: string) {
  const t = token?.trim()
  if (!productId || !t) return null
  await ensureFeatureSchema()
  await expireStaleReservations()
  const [row] = await db
    .select()
    .from(productReservations)
    .where(
      and(
        eq(productReservations.productId, productId),
        eq(productReservations.userToken, t),
        eq(productReservations.status, "active"),
        gt(productReservations.expiresAt, sql`now()`),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Réservation Platine : 1 unité / produit, 48 h.
 * Sécurise l'article avant les autres (stock virtuel tenu).
 */
export async function reserveProduct(productId: number, token: string) {
  const t = token?.trim()
  if (!productId || !t) return { ok: false as const, error: "Requête invalide." }

  await ensureFeatureSchema()
  await expireStaleReservations()

  const stats = await getCustomerStats(t)
  if (!stats.canReserve) {
    return { ok: false as const, error: "Réservation réservée au palier Platine (CA livré ≥ 600€)." }
  }

  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.token, t)).limit(1)
  if (!account) return { ok: false as const, error: "Compte introuvable." }

  const existing = await getMyReservation(productId, t)
  if (existing) {
    return {
      ok: true as const,
      already: true as const,
      expiresAt: existing.expiresAt,
    }
  }

  const available = await getAvailableStock(productId, t)
  if (available < 1) {
    return { ok: false as const, error: "Plus de stock disponible à réserver." }
  }

  // Max 3 réservations actives par client
  const activeCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(productReservations)
    .where(
      and(
        eq(productReservations.userToken, t),
        eq(productReservations.status, "active"),
        gt(productReservations.expiresAt, sql`now()`),
      ),
    )
  if (Number(activeCount[0]?.c ?? 0) >= 3) {
    return { ok: false as const, error: "Maximum 3 réservations actives. Consomme ou attends l'expiration." }
  }

  const expiresAt = new Date(Date.now() + PRODUCT_RESERVE_HOURS * 3600 * 1000)
  const [row] = await db
    .insert(productReservations)
    .values({
      productId,
      userToken: t,
      status: "active",
      expiresAt,
    })
    .returning()

  revalidatePath("/")
  return { ok: true as const, already: false as const, expiresAt: row.expiresAt }
}

export async function cancelReservation(productId: number, token: string) {
  const t = token?.trim()
  if (!productId || !t) return { ok: false as const }
  await ensureFeatureSchema()
  await db
    .update(productReservations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(productReservations.productId, productId),
        eq(productReservations.userToken, t),
        eq(productReservations.status, "active"),
      ),
    )
  revalidatePath("/")
  return { ok: true as const }
}

/** Appelé à la commande : consomme la réservation du produit si active. */
export async function consumeReservationsForOrder(token: string | undefined, productIds: number[]) {
  const t = token?.trim()
  if (!t || !productIds?.length) return
  await ensureFeatureSchema()
  const unique = [...new Set(productIds.filter((id) => id > 0))]
  for (const productId of unique) {
    await db
      .update(productReservations)
      .set({ status: "consumed" })
      .where(
        and(
          eq(productReservations.productId, productId),
          eq(productReservations.userToken, t),
          eq(productReservations.status, "active"),
        ),
      )
  }
}
