"use server"

import { db } from "@/lib/db"
import { productRatings, orderThreads, products, users, threadMessages } from "@/lib/db/schema"
import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer } from "@/lib/push"
import { clientThreadUrl } from "@/lib/deep-links"

/** Tag détecté côté client pour afficher le bouton « Noter mes produits ».
 *  Non exporté : un fichier "use server" ne peut exporter que des async functions. */
const RATING_INVITE_TAG = "[NOTER_PRODUITS]"

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

// ─────────────────────────────────────────────────────────────────────────────
// Admin — rattachement rétroactif product_ids depuis le texte récap
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogProductOption = { id: number; title: string }

export type BackfillTermStatus = "matched" | "uncertain" | "unmatched"

export type BackfillTermHit = {
  /** Terme extrait du texte commande (tel qu'affiché admin) */
  term: string
  status: BackfillTermStatus
  productId: number | null
  productTitle: string | null
  candidates: CatalogProductOption[]
}

export type BackfillOrderRow = {
  threadId: number
  customerName: string
  productsText: string
  status: string
  ready: boolean
  terms: BackfillTermHit[]
  resolvedIds: number[]
}

export type BackfillUncertainTerm = {
  term: string
  count: number
  orderIds: number[]
  candidates: CatalogProductOption[]
}

export type ProductIdBackfillAnalysis = {
  orders: BackfillOrderRow[]
  uncertainTerms: BackfillUncertainTerm[]
  catalog: CatalogProductOption[]
  stats: {
    ordersWithoutIds: number
    fullyResolvable: number
    blockedByUncertain: number
    uniqueUncertainTerms: number
  }
}

function normalizeProductLabel(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Extrait les noms produits depuis `products` ou `summary` (format panier / récap). */
function parseOrderProductTermsSync(products: string | null, summary: string | null): string[] {
  const terms: string[] = []

  const pushClean = (raw: string) => {
    let s = raw.trim()
    if (!s) return
    // Préfixe puces / lignes summary
    s = s.replace(/^[•\-\*]\s*/, "")
    // Préfixe quantité panier : "1x ", "2 x "
    s = s.replace(/^\d+\s*[x×]\s*/i, "")
    // Suffixe prix : " — 50€" / "- 50€"
    s = s.replace(/\s*[—–-]\s*\d+(?:[.,]\d+)?\s*€?\s*$/i, "")
    // Suffixe variante / qty compacte : " ×3" " x10"
    s = s.replace(/\s*[×x]\s*\d+\s*$/i, "")
    s = s.trim()
    if (s.length >= 1) terms.push(s)
  }

  if (products?.trim()) {
    // "1x Coke ×2, 1x La MD ×3" ou "Coke ×1, 3m ×1"
    for (const part of products.split(",")) pushClean(part)
  } else if (summary?.trim()) {
    // Lignes "• 1x Coke — 50€"
    for (const line of summary.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      if (/^[•\-\*]/.test(t) || /^\d+\s*[x×]/i.test(t) || /—.*€/.test(t)) {
        pushClean(t)
      }
    }
  }

  // Déduplique en gardant l'ordre (insensible à la casse)
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of terms) {
    const key = normalizeProductLabel(t)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function matchTermToCatalog(
  term: string,
  catalog: { id: number; title: string; norm: string }[],
): BackfillTermHit {
  const norm = normalizeProductLabel(term)
  if (!norm) {
    return { term, status: "unmatched", productId: null, productTitle: null, candidates: [] }
  }

  // 1) Exact
  const exact = catalog.filter((p) => p.norm === norm)
  if (exact.length === 1) {
    return {
      term,
      status: "matched",
      productId: exact[0]!.id,
      productTitle: exact[0]!.title,
      candidates: [],
    }
  }
  if (exact.length > 1) {
    return {
      term,
      status: "uncertain",
      productId: null,
      productTitle: null,
      candidates: exact.map((p) => ({ id: p.id, title: p.title })),
    }
  }

  // 2) Contient / est contenu (longueur mini pour éviter "k" / "3m" trop courts sauf égalité déjà gérée)
  const contains = catalog.filter((p) => {
    if (norm.length < 2 || p.norm.length < 2) return false
    // "bai" dans "baida", "la md" exact partiel
    return (
      (norm.length >= 3 && p.norm.includes(norm)) ||
      (p.norm.length >= 3 && norm.includes(p.norm))
    )
  })

  if (contains.length === 1) {
    // Match unique par inclusion → encore "matched" mais plus faible ;
    // on le traite comme matched pour le flux auto (souvent bai→Baïda, 3m, etc.)
    // Sauf si le ratio de longueur est trop faible (trop risqué)
    const p = contains[0]!
    const ratio = Math.min(norm.length, p.norm.length) / Math.max(norm.length, p.norm.length)
    if (ratio >= 0.45 || norm.length >= 4) {
      return {
        term,
        status: "matched",
        productId: p.id,
        productTitle: p.title,
        candidates: [],
      }
    }
  }

  if (contains.length >= 1) {
    return {
      term,
      status: "uncertain",
      productId: null,
      productTitle: null,
      candidates: contains.slice(0, 8).map((p) => ({ id: p.id, title: p.title })),
    }
  }

  // 3) Tokens en commun (ex. "lsd buvard" vs "LSD - Buvard 240ug")
  const termTokens = new Set(norm.split(" ").filter((t) => t.length >= 2))
  if (termTokens.size > 0) {
    const scored = catalog
      .map((p) => {
        const pt = p.norm.split(" ").filter((t) => t.length >= 2)
        const common = pt.filter((t) => termTokens.has(t)).length
        return { p, common, score: common / Math.max(termTokens.size, pt.length) }
      })
      .filter((x) => x.common >= 1 && x.score >= 0.4)
      .sort((a, b) => b.score - a.score || b.common - a.common)

    if (scored.length === 1 && scored[0]!.score >= 0.55) {
      const p = scored[0]!.p
      return {
        term,
        status: "matched",
        productId: p.id,
        productTitle: p.title,
        candidates: [],
      }
    }
    if (scored.length >= 1) {
      return {
        term,
        status: "uncertain",
        productId: null,
        productTitle: null,
        candidates: scored.slice(0, 8).map((x) => ({ id: x.p.id, title: x.p.title })),
      }
    }
  }

  return { term, status: "unmatched", productId: null, productTitle: null, candidates: [] }
}

function resolveTermWithMappings(
  term: string,
  catalog: { id: number; title: string; norm: string }[],
  mappings: Record<string, number>,
): BackfillTermHit {
  const key = normalizeProductLabel(term)
  const mappedId = mappings[key] ?? mappings[term]
  if (mappedId && Number.isFinite(mappedId)) {
    const p = catalog.find((c) => c.id === mappedId)
    if (p) {
      return {
        term,
        status: "matched",
        productId: p.id,
        productTitle: p.title,
        candidates: [],
      }
    }
  }
  return matchTermToCatalog(term, catalog)
}

/**
 * Analyse les commandes livrées sans product_ids et propose des rattachements.
 * Liste les termes incertains pour association manuelle.
 */
export async function analyzeProductIdBackfill(): Promise<ProductIdBackfillAnalysis> {
  const empty: ProductIdBackfillAnalysis = {
    orders: [],
    uncertainTerms: [],
    catalog: [],
    stats: {
      ordersWithoutIds: 0,
      fullyResolvable: 0,
      blockedByUncertain: 0,
      uniqueUncertainTerms: 0,
    },
  }

  try {
    if (!(await isAdminAuthenticated())) return empty

    const catalogRows = await db
      .select({ id: products.id, title: products.title })
      .from(products)
      .orderBy(products.title)

    const catalog = catalogRows.map((p) => ({
      id: p.id,
      title: p.title,
      norm: normalizeProductLabel(p.title),
    }))
    const catalogOpts: CatalogProductOption[] = catalogRows.map((p) => ({
      id: p.id,
      title: p.title,
    }))

    const delivered = await db
      .select({
        id: orderThreads.id,
        customerName: orderThreads.customerName,
        products: orderThreads.products,
        summary: orderThreads.summary,
        productIds: orderThreads.productIds,
        status: orderThreads.status,
      })
      .from(orderThreads)
      .where(eq(orderThreads.status, "livree"))
      .orderBy(desc(orderThreads.updatedAt))
      .limit(500)

    const withoutIds = delivered.filter((o) => {
      const ids = Array.isArray(o.productIds) ? o.productIds : []
      return ids.length === 0
    })

    const uncertainMap = new Map<
      string,
      { term: string; count: number; orderIds: number[]; candidates: CatalogProductOption[] }
    >()

    const orders: BackfillOrderRow[] = []

    for (const o of withoutIds) {
      const rawTerms = parseOrderProductTermsSync(o.products, o.summary)
      const productsText = (o.products?.trim() || o.summary?.slice(0, 120) || "—").trim()

      if (!rawTerms.length) {
        orders.push({
          threadId: o.id,
          customerName: o.customerName,
          productsText,
          status: o.status,
          ready: false,
          terms: [],
          resolvedIds: [],
        })
        continue
      }

      const terms = rawTerms.map((t) => matchTermToCatalog(t, catalog))
      const resolvedIds: number[] = []
      let ready = true
      for (const hit of terms) {
        if (hit.status === "matched" && hit.productId) {
          if (!resolvedIds.includes(hit.productId)) resolvedIds.push(hit.productId)
        } else {
          ready = false
          const key = normalizeProductLabel(hit.term)
          const prev = uncertainMap.get(key)
          if (prev) {
            prev.count++
            if (!prev.orderIds.includes(o.id)) prev.orderIds.push(o.id)
            // enrichir candidats
            for (const c of hit.candidates) {
              if (!prev.candidates.some((x) => x.id === c.id)) prev.candidates.push(c)
            }
          } else {
            uncertainMap.set(key, {
              term: hit.term,
              count: 1,
              orderIds: [o.id],
              candidates: [...hit.candidates],
            })
          }
        }
      }

      orders.push({
        threadId: o.id,
        customerName: o.customerName,
        productsText,
        status: o.status,
        ready: ready && resolvedIds.length > 0,
        terms,
        resolvedIds,
      })
    }

    const uncertainTerms: BackfillUncertainTerm[] = [...uncertainMap.values()]
      .map((u) => ({
        term: u.term,
        count: u.count,
        orderIds: u.orderIds,
        candidates: u.candidates.slice(0, 8),
      }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))

    const fullyResolvable = orders.filter((o) => o.ready).length
    const blockedByUncertain = orders.filter((o) => !o.ready && o.terms.length > 0).length

    return {
      orders,
      uncertainTerms,
      catalog: catalogOpts,
      stats: {
        ordersWithoutIds: withoutIds.length,
        fullyResolvable,
        blockedByUncertain,
        uniqueUncertainTerms: uncertainTerms.length,
      },
    }
  } catch (e) {
    console.error("[ratings-admin] analyzeProductIdBackfill failed:", e)
    return empty
  }
}

/**
 * Applique le rattachement product_ids.
 * @param mappings  terme normalisé ou brut → productId (associations manuelles admin)
 * @param onlyReady  si true, n'écrit que les commandes 100% résolues
 */
export async function applyProductIdBackfill(input: {
  mappings?: Record<string, number>
  onlyThreadIds?: number[]
}): Promise<
  | { ok: true; updated: number; skipped: number; stillBlocked: string[] }
  | { ok: false; error: string }
> {
  try {
    if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

    const mappingsRaw = input.mappings ?? {}
    // Indexe les mappings par forme normalisée
    const mappings: Record<string, number> = {}
    for (const [k, v] of Object.entries(mappingsRaw)) {
      const id = Math.trunc(Number(v))
      if (!k || !Number.isFinite(id) || id <= 0) continue
      mappings[k] = id
      mappings[normalizeProductLabel(k)] = id
    }

    const catalogRows = await db
      .select({ id: products.id, title: products.title })
      .from(products)
    const catalog = catalogRows.map((p) => ({
      id: p.id,
      title: p.title,
      norm: normalizeProductLabel(p.title),
    }))

    const delivered = await db
      .select({
        id: orderThreads.id,
        products: orderThreads.products,
        summary: orderThreads.summary,
        productIds: orderThreads.productIds,
        status: orderThreads.status,
      })
      .from(orderThreads)
      .where(eq(orderThreads.status, "livree"))
      .limit(500)

    const filterIds = input.onlyThreadIds?.length
      ? new Set(input.onlyThreadIds.map((n) => Math.trunc(Number(n))))
      : null

    let updated = 0
    let skipped = 0
    const stillBlocked: string[] = []

    for (const o of delivered) {
      if (filterIds && !filterIds.has(o.id)) continue
      const existing = Array.isArray(o.productIds) ? o.productIds : []
      if (existing.length > 0) {
        skipped++
        continue
      }

      const rawTerms = parseOrderProductTermsSync(o.products, o.summary)
      if (!rawTerms.length) {
        skipped++
        stillBlocked.push(`#${o.id} : aucun produit lisible`)
        continue
      }

      const hits = rawTerms.map((t) => resolveTermWithMappings(t, catalog, mappings))
      const ids: number[] = []
      let ok = true
      const missing: string[] = []
      for (const h of hits) {
        if (h.status === "matched" && h.productId) {
          if (!ids.includes(h.productId)) ids.push(h.productId)
        } else {
          ok = false
          missing.push(h.term)
        }
      }

      if (!ok || !ids.length) {
        skipped++
        stillBlocked.push(`#${o.id} : ${missing.join(", ") || "non résolu"}`)
        continue
      }

      try {
        await db
          .update(orderThreads)
          .set({ productIds: ids })
          .where(eq(orderThreads.id, o.id))
        updated++
      } catch (e) {
        skipped++
        stillBlocked.push(`#${o.id} : erreur écriture`)
        console.error("[ratings-admin] backfill write failed", o.id, e)
      }
    }

    revalidatePath("/admin")
    return { ok: true, updated, skipped, stillBlocked: stillBlocked.slice(0, 40) }
  } catch (e) {
    console.error("[ratings-admin] applyProductIdBackfill failed:", e)
    return { ok: false, error: "Erreur serveur." }
  }
}

