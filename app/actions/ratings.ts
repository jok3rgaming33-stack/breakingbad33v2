"use server"

import { db } from "@/lib/db"
import { productRatings, orderThreads, products, users, threadMessages } from "@/lib/db/schema"
import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer } from "@/lib/push"
import { clientThreadUrl } from "@/lib/deep-links"

/** Tag détecté côté client pour afficher le bouton « Noter mes produits ». */
export const RATING_INVITE_TAG = "[NOTER_PRODUITS]"

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

  // Vérifier que le productId figure dans les produits de la commande (productIds requis)
  const pids = Array.isArray(thread.productIds) ? thread.productIds : []
  if (!pids.length) return { ok: false, error: "Commande sans produits notifiables." }
  if (!pids.includes(productId)) return { ok: false, error: "Produit non commandé." }

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

  // Commandes livrées du client — uniquement celles avec productIds non vides
  const delivered = await db
    .select({ id: orderThreads.id, productIds: orderThreads.productIds })
    .from(orderThreads)
    .where(and(eq(orderThreads.customerToken, token), eq(orderThreads.status, "livree")))

  const withProducts = delivered.filter(
    (t) => Array.isArray(t.productIds) && t.productIds.length > 0,
  )
  if (!withProducts.length) return []

  // Avis déjà donnés
  const threadIds = withProducts.map((t) => t.id)
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
  for (const t of withProducts) {
    for (const id of t.productIds) allProductIds.add(id)
  }

  if (!allProductIds.size) return []

  const productRows = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(inArray(products.id, [...allProductIds]))

  const productMap = new Map(productRows.map((p) => [p.id, p.title]))

  const result: RatableProduct[] = []
  for (const thread of withProducts) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin — relances + vue d'ensemble des notations
// ─────────────────────────────────────────────────────────────────────────────

export type RatingInviteTarget = {
  threadId: number
  customerName: string
  customerToken: string
  summary: string
  total: number
  fulfillment: string
  productCount: number
  ratedCount: number
  pendingCount: number
  alreadyInvited: boolean
  updatedAt: Date | string
}

export type RatingAdminOverview = {
  targets: RatingInviteTarget[]
  stats: {
    ordersWithProducts: number
    pendingOrders: number
    fullyRatedOrders: number
    totalRatings: number
    avgScore: number | null
  }
  recentRatings: {
    id: number
    productTitle: string
    pseudo: string | null
    threadId: number
    avgScore: number
    comment: string | null
    createdAt: Date | string
  }[]
}

/**
 * Liste les commandes livrées avec productIds, et l'état de notation / invitation.
 * Soft : renvoie un overview vide en cas d'erreur ou non-admin.
 */
export async function getRatingsAdminOverview(): Promise<RatingAdminOverview> {
  const empty: RatingAdminOverview = {
    targets: [],
    stats: {
      ordersWithProducts: 0,
      pendingOrders: 0,
      fullyRatedOrders: 0,
      totalRatings: 0,
      avgScore: null,
    },
    recentRatings: [],
  }

  try {
    if (!(await isAdminAuthenticated())) return empty

    const delivered = await db
      .select({
        id: orderThreads.id,
        customerName: orderThreads.customerName,
        customerToken: orderThreads.customerToken,
        summary: orderThreads.summary,
        total: orderThreads.total,
        fulfillment: orderThreads.fulfillment,
        productIds: orderThreads.productIds,
        updatedAt: orderThreads.updatedAt,
      })
      .from(orderThreads)
      .where(eq(orderThreads.status, "livree"))
      .orderBy(desc(orderThreads.updatedAt))
      .limit(400)

    const eligible = delivered.filter(
      (o) =>
        !!o.customerToken?.trim() &&
        Array.isArray(o.productIds) &&
        o.productIds.length > 0,
    )

    const threadIds = eligible.map((o) => o.id)
    const ratings =
      threadIds.length > 0
        ? await db
            .select({
              productId: productRatings.productId,
              threadId: productRatings.threadId,
              quality: productRatings.quality,
              quantity: productRatings.quantity,
              packaging: productRatings.packaging,
              delivery: productRatings.delivery,
            })
            .from(productRatings)
            .where(inArray(productRatings.threadId, threadIds))
        : []

    const ratedByThread = new Map<number, Set<number>>()
    for (const r of ratings) {
      const set = ratedByThread.get(r.threadId) ?? new Set<number>()
      set.add(r.productId)
      ratedByThread.set(r.threadId, set)
    }

    // Invitations déjà envoyées (message [NOTER_PRODUITS] sur le fil)
    const invitedSet = new Set<number>()
    if (threadIds.length > 0) {
      try {
        const invites = await db
          .select({ threadId: threadMessages.threadId, body: threadMessages.body })
          .from(threadMessages)
          .where(inArray(threadMessages.threadId, threadIds))
        for (const m of invites) {
          if (m.body?.startsWith(RATING_INVITE_TAG)) invitedSet.add(m.threadId)
        }
      } catch (e) {
        console.error("[ratings-admin] invite scan failed:", e)
      }
    }

    const targets: RatingInviteTarget[] = eligible.map((o) => {
      const pids = o.productIds
      const rated = ratedByThread.get(o.id) ?? new Set()
      let ratedCount = 0
      for (const pid of pids) {
        if (rated.has(pid)) ratedCount++
      }
      return {
        threadId: o.id,
        customerName: o.customerName,
        customerToken: o.customerToken!,
        summary: o.summary,
        total: o.total ?? 0,
        fulfillment: o.fulfillment ?? "livraison",
        productCount: pids.length,
        ratedCount,
        pendingCount: Math.max(0, pids.length - ratedCount),
        alreadyInvited: invitedSet.has(o.id),
        updatedAt: o.updatedAt,
      }
    })

    // Stats globales (tous les avis, pas seulement le batch)
    let totalRatings = 0
    let avgScore: number | null = null
    try {
      const all = await db
        .select({
          quality: productRatings.quality,
          quantity: productRatings.quantity,
          packaging: productRatings.packaging,
          delivery: productRatings.delivery,
        })
        .from(productRatings)
      totalRatings = all.length
      if (all.length) {
        const sum = all.reduce((a, r) => a + avgOfFour(r), 0)
        avgScore = Math.round((sum / all.length) * 10) / 10
      }
    } catch (e) {
      console.error("[ratings-admin] stats failed:", e)
    }

    // Derniers avis reçus
    let recentRatings: RatingAdminOverview["recentRatings"] = []
    try {
      const recent = await db
        .select({
          id: productRatings.id,
          productId: productRatings.productId,
          threadId: productRatings.threadId,
          quality: productRatings.quality,
          quantity: productRatings.quantity,
          packaging: productRatings.packaging,
          delivery: productRatings.delivery,
          comment: productRatings.comment,
          createdAt: productRatings.createdAt,
          userPseudo: users.pseudo,
          productTitle: products.title,
        })
        .from(productRatings)
        .leftJoin(users, eq(users.token, productRatings.customerToken))
        .leftJoin(products, eq(products.id, productRatings.productId))
        .orderBy(desc(productRatings.createdAt))
        .limit(30)

      recentRatings = recent.map((r) => ({
        id: r.id,
        productTitle: r.productTitle ?? `Produit #${r.productId}`,
        pseudo: r.userPseudo ?? null,
        threadId: r.threadId,
        avgScore: avgOfFour(r),
        comment: r.comment,
        createdAt: r.createdAt,
      }))
    } catch (e) {
      console.error("[ratings-admin] recent ratings failed:", e)
    }

    const pendingOrders = targets.filter((t) => t.pendingCount > 0).length
    const fullyRatedOrders = targets.filter((t) => t.pendingCount === 0).length

    return {
      targets,
      stats: {
        ordersWithProducts: targets.length,
        pendingOrders,
        fullyRatedOrders,
        totalRatings,
        avgScore,
      },
      recentRatings,
    }
  } catch (e) {
    console.error("[ratings-admin] getRatingsAdminOverview failed:", e)
    return empty
  }
}

/**
 * Envoie une invitation à noter sur le fil de commande (archives livrées avec productIds).
 * Uniquement si au moins un produit de la commande n'est pas encore noté.
 * Soft par commande : un échec n'arrête pas le lot.
 */
export async function sendRatingInvites(
  threadIds: number[],
): Promise<{ ok: true; sent: number; skipped: number; errors: string[] } | { ok: false; error: string }> {
  try {
    if (!(await isAdminAuthenticated())) {
      return { ok: false, error: "Non autorisé." }
    }

    const ids = [...new Set(threadIds.map((n) => Math.trunc(Number(n))).filter((n) => n > 0))]
    if (!ids.length) return { ok: false, error: "Aucune commande sélectionnée." }
    if (ids.length > 100) return { ok: false, error: "Maximum 100 invitations à la fois." }

    const rows = await db
      .select({
        id: orderThreads.id,
        customerToken: orderThreads.customerToken,
        status: orderThreads.status,
        productIds: orderThreads.productIds,
        fulfillment: orderThreads.fulfillment,
      })
      .from(orderThreads)
      .where(inArray(orderThreads.id, ids))

    const byId = new Map(rows.map((r) => [r.id, r]))

    // Ratings existants pour ces fils
    const existing =
      ids.length > 0
        ? await db
            .select({
              productId: productRatings.productId,
              threadId: productRatings.threadId,
            })
            .from(productRatings)
            .where(inArray(productRatings.threadId, ids))
        : []
    const ratedByThread = new Map<number, Set<number>>()
    for (const r of existing) {
      const set = ratedByThread.get(r.threadId) ?? new Set<number>()
      set.add(r.productId)
      ratedByThread.set(r.threadId, set)
    }

    const body = [
      RATING_INVITE_TAG,
      "Bonjour ! Nous espérons que ta commande t'a plu.",
      "",
      "Prends 1 minute pour noter ton expérience produit par produit — ça nous aide vraiment à améliorer le labo.",
      "",
      "Merci,",
      "Le chimiste",
    ].join("\n")

    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const id of ids) {
      const order = byId.get(id)
      if (!order) {
        skipped++
        errors.push(`#${id} : introuvable`)
        continue
      }
      if (order.status !== "livree") {
        skipped++
        continue
      }
      const token = order.customerToken?.trim()
      if (!token) {
        skipped++
        continue
      }
      const pids = Array.isArray(order.productIds) ? order.productIds : []
      if (!pids.length) {
        skipped++
        continue
      }
      const rated = ratedByThread.get(id) ?? new Set()
      const pending = pids.filter((pid) => !rated.has(pid))
      if (!pending.length) {
        skipped++
        continue
      }

      try {
        await db.insert(threadMessages).values({
          threadId: id,
          sender: "vendeur",
          body,
        })
        await db
          .update(orderThreads)
          .set({ updatedAt: sql`now()` })
          .where(eq(orderThreads.id, id))

        // Push soft
        try {
          const open =
            order.fulfillment === "locker" ? ("locker" as const) : ("orders" as const)
          await notifyCustomer(token, {
            title: "Note ton expérience ⭐",
            body: "Un message t'attend pour noter les produits de ta commande livrée.",
            url: clientThreadUrl(open, id),
            tag: `rating-invite-${id}`,
            threadId: id,
            open,
          })
        } catch {
          /* soft */
        }

        sent++
      } catch (e) {
        skipped++
        errors.push(`#${id} : échec envoi`)
        console.error("[ratings-admin] send invite failed", id, e)
      }
    }

    revalidatePath("/admin")
    revalidatePath("/messagerie")
    return { ok: true, sent, skipped, errors }
  } catch (e) {
    console.error("[ratings-admin] sendRatingInvites failed:", e)
    return { ok: false, error: "Erreur serveur." }
  }
}

