"use server"

import { db } from "@/lib/db"
import { orderThreads } from "@/lib/db/schema"
import { eq, inArray, sql } from "drizzle-orm"
import { normalizeStatus } from "@/lib/order-status"
import { updateThreadStatus } from "@/app/actions/messaging"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

export type RunDeliveryView = {
  id: number
  status: string
  fulfillment: string
  customerName: string
  address: string | null
  scheduledSlot: string | null
  scheduledDate: string | null
  total: number
  etaMin: number | null
  etaArriveBy: string | null
}

export async function getRunDelivery(token: string): Promise<RunDeliveryView | null> {
  const t = token?.trim()
  if (!t || !t.startsWith("RUN_")) return null
  const [row] = await db.select().from(orderThreads).where(eq(orderThreads.runToken, t)).limit(1)
  if (!row) return null
  const tracking = row.tracking && typeof row.tracking === "object" ? row.tracking : {}
  return {
    id: row.id,
    status: row.status,
    fulfillment: row.fulfillment,
    customerName: row.customerName,
    address: row.address,
    scheduledSlot: row.scheduledSlot,
    scheduledDate: row.scheduledDate,
    total: row.total,
    etaMin: typeof tracking.etaMin === "number" ? tracking.etaMin : null,
    etaArriveBy: tracking.etaArriveBy ?? null,
  }
}

export async function advanceRunDelivery(
  token: string,
  action: "arrivee" | "livree",
): Promise<{ ok: boolean; error?: string; view?: RunDeliveryView | null }> {
  const t = token?.trim()
  if (!t || !t.startsWith("RUN_")) return { ok: false, error: "Lien invalide." }
  const [row] = await db.select().from(orderThreads).where(eq(orderThreads.runToken, t)).limit(1)
  if (!row) return { ok: false, error: "Commande introuvable." }

  const current = normalizeStatus(row.status)
  if (current === "livree" || current === "annulee") {
    return { ok: false, error: "Cette commande est déjà clôturée." }
  }
  if (action === "arrivee" && current !== "livraison") {
    return { ok: false, error: "Passe d'abord en livraison." }
  }
  if (action === "livree" && current !== "livraison" && current !== "arrivee") {
    return { ok: false, error: "La commande n'est pas en tournée." }
  }

  await updateThreadStatus(row.id, action)
  const view = await getRunDelivery(t)
  return { ok: true, view }
}

export type ActiveRunRow = RunDeliveryView & { runToken: string }

/** Feuille de tournée (admin connecté) : toutes les commandes en route / sur place. */
export async function listActiveRunDeliveries(): Promise<{
  ok: boolean
  rows: ActiveRunRow[]
  admin: boolean
}> {
  const admin = await isAdminAuthenticated()
  if (!admin) return { ok: false, rows: [], admin: false }

  const raw = await db
    .select()
    .from(orderThreads)
    .where(inArray(orderThreads.status, ["livraison", "arrivee"]))
    .orderBy(sql`${orderThreads.updatedAt} DESC`)

  const rows: ActiveRunRow[] = []
  for (const row of raw) {
    let token = row.runToken
    if (!token) {
      token = `RUN_${crypto.randomUUID().replace(/-/g, "")}`
      try {
        await db.update(orderThreads).set({ runToken: token }).where(eq(orderThreads.id, row.id))
      } catch {
        continue
      }
    }
    const tracking = row.tracking && typeof row.tracking === "object" ? row.tracking : {}
    rows.push({
      id: row.id,
      status: row.status,
      fulfillment: row.fulfillment,
      customerName: row.customerName,
      address: row.address,
      scheduledSlot: row.scheduledSlot,
      scheduledDate: row.scheduledDate,
      total: row.total,
      etaMin: typeof tracking.etaMin === "number" ? tracking.etaMin : null,
      etaArriveBy: tracking.etaArriveBy ?? null,
      runToken: token,
    })
  }

  return { ok: true, rows, admin: true }
}
