"use server"

import { db } from "@/lib/db"
import { restockAlerts, products } from "@/lib/db/schema"
import { notifyCustomer } from "@/lib/push"
import { and, eq } from "drizzle-orm"

// Le client demande à être prévenu quand un produit en rupture revient en stock.
export async function requestRestockAlert(productId: number, userToken: string) {
  const token = userToken?.trim()
  if (!productId || !token) return { ok: false as const, error: "Requête invalide." }
  try {
    // Évite les doublons : si une alerte non traitée existe déjà, on ne fait rien.
    const existing = await db
      .select({ id: restockAlerts.id })
      .from(restockAlerts)
      .where(and(eq(restockAlerts.productId, productId), eq(restockAlerts.userToken, token), eq(restockAlerts.notified, false)))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(restockAlerts).values({ productId, userToken: token, notified: false })
    }
    return { ok: true as const }
  } catch (err) {
    console.log("[v0] requestRestockAlert error:", err)
    return { ok: false as const, error: "Impossible d'enregistrer l'alerte." }
  }
}

// Indique si un client a déjà une alerte active pour un produit.
export async function hasRestockAlert(productId: number, userToken: string) {
  const token = userToken?.trim()
  if (!productId || !token) return false
  const rows = await db
    .select({ id: restockAlerts.id })
    .from(restockAlerts)
    .where(and(eq(restockAlerts.productId, productId), eq(restockAlerts.userToken, token), eq(restockAlerts.notified, false)))
    .limit(1)
  return rows.length > 0
}

// Notifie tous les clients en attente quand un produit revient en stock,
// puis marque les alertes comme traitées. Appelé depuis les actions de stock.
export async function notifyRestock(productId: number) {
  if (!productId) return
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  if (!product) return

  const alerts = await db
    .select()
    .from(restockAlerts)
    .where(and(eq(restockAlerts.productId, productId), eq(restockAlerts.notified, false)))

  if (alerts.length === 0) return

  await Promise.all(
    alerts.map((a) =>
      notifyCustomer(a.userToken, {
        title: "Produit de nouveau disponible",
        body: `${product.title} est de retour en stock. Commande vite avant rupture !`,
        url: "/",
        tag: `restock-${productId}`,
      }),
    ),
  )

  // Une fois notifiés, on retire les alertes pour éviter les doublons.
  await db.delete(restockAlerts).where(and(eq(restockAlerts.productId, productId), eq(restockAlerts.notified, false)))
}
