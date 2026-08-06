"use server"

import { db } from "@/lib/db"
import { productRatings, orderThreads, products, users } from "@/lib/db/schema"
import { eq, and, avg, count, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RatableProduct = {
  productId: number
  productTitle: string
  threadId: number
  alreadyRated: boolean
}

export type ProductRatingSummary = {
  productId: number
  avgScore: number // moyenne arrondie à 1 décimale, /5
  count: number
}

export type ProductRatingDetail = {
  id: number
  customerToken: string
  // Pseudo du compte lié au token (null si compte non trouvé)
  pseudo: string | null
  threadId: number
  quality: number
  quantity: number
  packaging: number
  delivery: number
  comment: string | null
  createdAt: Date
  avgScore: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function avgOfFour(r: { quality: number; quantity: number; packaging: number; delivery: number }) {
  return Math.round(((r.quality + r.quantity + r.packaging + r.delivery) / 4) * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// Soumission d'une note
// ─────────────────────────────────────────────────────────────────────────────

export async function submitRating(params: {
  customerToken: string
  productId: number
  threadId: number
  quality: number
  quantity: number
  packaging: number
  delivery: number
  comment?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { customerToken, productId, threadId, quality, quantity, packaging, delivery, comment } = params

  // Vérifications de base
  if (!customerToken?.trim()) return { ok: false, error: "Non autorisé." }
  for (const v of [quality, quantity, packaging, delivery]) {
    if (!Number.isInteger(v) || v < 0 || v > 5) return { ok: false, error: "Note invalide." }
  }

  // Vérifier que le fil appartient au client et est bien "livree"
  const [thread] = await db
    .select({ id: orderThreads.id, status: orderThreads.status, productIds: orderThreads.productIds, customerToken: orderThreads.customerToken })
    .from(orderThreads)
    .where(and(eq(orderThreads.id, threadId), eq(orderThreads.customerToken, customerToken)))
    .limit(1)

  if (!thread) return { ok: false, error: "Commande introuvable." }
  if (thread.status !== "livree") return { ok: false, error: "La commande doit être livrée pour noter." }

  // Vérifier que le productId figure dans les produits de la commande
  if (!thread.productIds.includes(productId)) return { ok: false, error: "Produit non commandé." }

  // Vérifier qu'il n'a pas déjà noté ce produit pour cette commande
  const [existing] = await db
    .select({ id: productRatings.id })
    .from(productRatings)
    .where(
      and(
        eq(productRatings.customerToken, customerToken),
        eq(productRatings.productId, productId),
        eq(productRatings.threadId, threadId),
      )
    )
    .limit(1)

  if (existing) return { ok: false, error: "Vous avez déjà noté ce produit pour cette commande." }

  const trimmedComment = comment?.trim().slice(0, 200) || null

  await db.insert(productRatings).values({
    productId,
    customerToken,
    threadId,
    quality,
    quantity,
    packaging,
    delivery,
    comment: trimmedComment,
  })

  revalidatePath("/")
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Produits éligibles à la notation pour un client
// ─────────────────────────────────────────────────────────────────────────────

export async function getRatableProducts(customerToken: string): Promise<RatableProduct[]> {
  const token = customerToken?.trim()
  if (!token) return []

  // Toutes les commandes livrées du client
  const delivered = await db
    .select({ id: orderThreads.id, productIds: orderThreads.productIds })
    .from(orderThreads)
    .where(and(eq(orderThreads.customerToken, token), eq(orderThreads.status, "livree")))

  if (!delivered.length) return []

  // Avis déjà donnés
  const threadIds = delivered.map((t) => t.id)
  const alreadyRated = await db
    .select({ productId: productRatings.productId, threadId: productRatings.threadId })
    .from(productRatings)
    .where(
      and(
        eq(productRatings.customerToken, token),
        inArray(productRatings.threadId, threadIds),
      )
    )

  const ratedSet = new Set(alreadyRated.map((r) => `${r.productId}:${r.threadId}`))

  // Construire la liste des produits éligibles avec noms
  const allProductIds = new Set<number>()
  for (const t of delivered) {
    for (const id of t.productIds) allProductIds.add(id)
  }

  if (!allProductIds.size) return []

  const productRows = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(inArray(products.id, [...allProductIds]))

  const productMap = new Map(productRows.map((p) => [p.id, p.title]))

  const result: RatableProduct[] = []
  for (const thread of delivered) {
    for (const pid of thread.productIds) {
      result.push({
        productId: pid,
        productTitle: productMap.get(pid) ?? `Produit #${pid}`,
        threadId: thread.id,
        alreadyRated: ratedSet.has(`${pid}:${thread.id}`),
      })
    }
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Résumé public des notes d'un produit (badge sur la vignette)
// ─────────────────────────────────────────────────────────────────────────────

export async function getProductRatingSummary(productId: number): Promise<ProductRatingSummary | null> {
  const rows = await db
    .select({ quality: productRatings.quality, quantity: productRatings.quantity, packaging: productRatings.packaging, delivery: productRatings.delivery })
    .from(productRatings)
    .where(eq(productRatings.productId, productId))

  if (!rows.length) return null

  const total = rows.reduce((acc, r) => acc + avgOfFour(r), 0)
  return {
    productId,
    avgScore: Math.round((total / rows.length) * 10) / 10,
    count: rows.length,
  }
}

// Résumés de plusieurs produits à la fois (pour la grille)
export async function getProductRatingSummaries(productIds: number[]): Promise<Record<number, ProductRatingSummary>> {
  if (!productIds.length) return {}

  const rows = await db
    .select({ productId: productRatings.productId, quality: productRatings.quality, quantity: productRatings.quantity, packaging: productRatings.packaging, delivery: productRatings.delivery })
    .from(productRatings)
    .where(inArray(productRatings.productId, productIds))

  const grouped = new Map<number, { sum: number; count: number }>()
  for (const r of rows) {
    const existing = grouped.get(r.productId) ?? { sum: 0, count: 0 }
    grouped.set(r.productId, { sum: existing.sum + avgOfFour(r), count: existing.count + 1 })
  }

  const result: Record<number, ProductRatingSummary> = {}
  for (const [productId, { sum, count }] of grouped) {
    result[productId] = { productId, avgScore: Math.round((sum / count) * 10) / 10, count }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Détail de tous les avis d'un produit (modale de synthèse)
// ─────────────────────────────────────────────────────────────────────────────

export async function getProductRatingDetails(productId: number): Promise<ProductRatingDetail[]> {
  // Alias explicite pour éviter tout conflit de nommage Drizzle entre les tables.
  const rows = await db
    .select({
      id: productRatings.id,
      customerToken: productRatings.customerToken,
      userPseudo: users.pseudo,
      threadId: productRatings.threadId,
      quality: productRatings.quality,
      quantity: productRatings.quantity,
      packaging: productRatings.packaging,
      delivery: productRatings.delivery,
      comment: productRatings.comment,
      createdAt: productRatings.createdAt,
    })
    .from(productRatings)
    .leftJoin(users, eq(users.token, productRatings.customerToken))
    .where(eq(productRatings.productId, productId))
    .orderBy(sql`${productRatings.createdAt} DESC`)

  return rows.map((r) => ({
    id: r.id,
    customerToken: r.customerToken,
    pseudo: r.userPseudo ?? null,
    threadId: r.threadId,
    quality: r.quality,
    quantity: r.quantity,
    packaging: r.packaging,
    delivery: r.delivery,
    comment: r.comment,
    createdAt: r.createdAt,
    avgScore: avgOfFour(r),
  }))
}


