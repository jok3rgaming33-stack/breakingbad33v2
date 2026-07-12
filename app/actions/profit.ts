"use server"

import { db } from "@/lib/db"
import { products, productCosts, orderThreads } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { eq, asc, gte, and, ne } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type ProductProfitRow = {
  id: number
  title: string
  costPrice: number       // prix d'achat saisi
  unitsSold: number       // total unités vendues
  revenue: number         // CA brut (somme des totaux des commandes imputées)
  netProfit: number       // CA - (coût × unités vendues)
}

export type ProfitSummary = {
  products: ProductProfitRow[]
  totalRevenue: number
  totalCost: number
  totalNetProfit: number
}

// Parse "1x Coke ×2", "1x X-Taze ×10", etc. → { title, qty }[]
// Le format est "Nx <titre> ×Q" : N = nb références (ignoré), Q = quantité réelle achetée.
function parseOrderProducts(raw: string | null): { title: string; qty: number }[] {
  if (!raw) return []
  return raw.split(",").map(s => s.trim()).flatMap(segment => {
    // Capture : titre entre le premier "x " et le "×Q" final (ou fin de chaîne)
    const m = segment.match(/^\d+x\s+(.+?)\s+[×x](\d+)$/)
    if (m) return [{ title: m[1].trim(), qty: parseInt(m[2], 10) }]
    // Fallback : pas de ×Q → quantité = 1
    const m2 = segment.match(/^\d+x\s+(.+)$/)
    if (m2) return [{ title: m2[1].trim(), qty: 1 }]
    return []
  })
}

// Calcule les profits sur une plage de dates (startDate = undefined = tout temps).
export async function getProfitData(startDate?: Date): Promise<ProfitSummary> {
  if (!(await isAdminAuthenticated())) {
    return { products: [], totalRevenue: 0, totalCost: 0, totalNetProfit: 0 }
  }

  const [allProducts, allCosts, orders] = await Promise.all([
    db.select({ id: products.id, title: products.title }).from(products).orderBy(asc(products.sortOrder), asc(products.id)),
    db.select().from(productCosts),
    db.select({ products: orderThreads.products, total: orderThreads.total, createdAt: orderThreads.createdAt })
      .from(orderThreads)
      .where(
        and(
          ne(orderThreads.status, "trk_token"),
          ne(orderThreads.status, "annulee"),
          startDate ? gte(orderThreads.createdAt, startDate) : undefined,
        )
      ),
  ])

  const costMap = new Map(allCosts.map(c => [c.productId, c.costPrice]))

  // Compter les unités vendues et le CA par produit
  const unitsSoldMap = new Map<number, number>()   // productId → unités
  const revenueMap = new Map<number, number>()      // productId → CA imputé

  for (const order of orders) {
    const items = parseOrderProducts(order.products)
    if (!items.length) continue
    // Répartir le total de la commande proportionnellement entre produits (best-effort)
    const total = order.total ?? 0
    const totalQty = items.reduce((s, i) => s + i.qty, 0)

    for (const item of items) {
      // Match insensible à la casse
      const prod = allProducts.find(p => p.title.toLowerCase() === item.title.toLowerCase())
      if (!prod) continue
      const prev = unitsSoldMap.get(prod.id) ?? 0
      unitsSoldMap.set(prod.id, prev + item.qty)
      // CA imputé proportionnel au nombre d'unités de ce produit
      const share = totalQty > 0 ? (item.qty / totalQty) * total : 0
      revenueMap.set(prod.id, (revenueMap.get(prod.id) ?? 0) + share)
    }
  }

  const rows: ProductProfitRow[] = allProducts.map(p => {
    const costPrice = costMap.get(p.id) ?? 0
    const unitsSold = unitsSoldMap.get(p.id) ?? 0
    const revenue = Math.round(revenueMap.get(p.id) ?? 0)
    const netProfit = Math.round(revenue - costPrice * unitsSold)
    return { id: p.id, title: p.title, costPrice, unitsSold, revenue, netProfit }
  })

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCost = rows.reduce((s, r) => s + r.costPrice * r.unitsSold, 0)
  const totalNetProfit = Math.round(totalRevenue - totalCost)

  return { products: rows, totalRevenue, totalCost, totalNetProfit }
}

// Sauvegarde le prix d'achat d'un produit.
export async function saveProductCost(productId: number, costPrice: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const }
  const cost = Math.max(0, Number(costPrice) || 0)
  await db
    .insert(productCosts)
    .values({ productId, costPrice: cost, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productCosts.productId, set: { costPrice: cost, updatedAt: new Date() } })
  revalidatePath("/admin")
  return { ok: true as const }
}
