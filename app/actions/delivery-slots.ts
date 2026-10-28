"use server"

import { db } from "@/lib/db"
import { orderThreads } from "@/lib/db/schema"
import { and, eq, notInArray, sql } from "drizzle-orm"
import {
  DELIVERY_SLOT_CAPACITY,
  DELIVERY_SLOT_CLIENT_MAX,
  deliverySlotIsFull,
  deliverySlotRemaining,
} from "@/lib/delivery-slots"
import { deliveryStartStillAhead, frDayName, slotMatchesDay } from "@/lib/paris-clock"
import { getCartConfig } from "@/app/actions/settings"

/** Statuts qui libèrent le créneau (annulé / pas une commande livraison). */
const FREE_STATUSES = [
  "annulee",
  "discussion",
  "pris_en_charge",
  "ouvert",
  "ferme",
  "notification",
  "trk_token",
]

export async function countDeliverySlotOrders(date: string, slot: string): Promise<number> {
  const d = date.trim()
  const s = slot.trim()
  if (!d || !s) return 0
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.fulfillment, "livraison"),
        eq(orderThreads.scheduledDate, d),
        eq(orderThreads.scheduledSlot, s),
        notInArray(orderThreads.status, FREE_STATUSES),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/** Occupancy réelle (sans la place fantôme) par label de créneau, pour une date. */
export async function getDeliverySlotOccupancy(date: string): Promise<Record<string, number>> {
  const d = date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return {}
  const rows = await db
    .select({
      slot: orderThreads.scheduledSlot,
      n: sql<number>`count(*)::int`,
    })
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.fulfillment, "livraison"),
        eq(orderThreads.scheduledDate, d),
        notInArray(orderThreads.status, FREE_STATUSES),
      ),
    )
    .groupBy(orderThreads.scheduledSlot)

  const out: Record<string, number> = {}
  for (const r of rows) {
    if (r.slot) out[r.slot] = Number(r.n ?? 0)
  }
  return out
}

export async function assertDeliverySlotAvailable(
  date: string | undefined,
  slot: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = date?.trim() ?? ""
  const s = slot?.trim() ?? ""
  if (!d || !s) return { ok: false, error: "Choisis une date et un créneau de livraison." }
  const cfg = await getCartConfig()
  const known = cfg.deliverySlots.find((slot) => slot.label === s)
  if (known && !slotMatchesDay(known, frDayName(d))) {
    return { ok: false, error: "Ce créneau n'est pas proposé ce jour-là." }
  }
  const startHour = known?.startHour ?? hourFromLabel(s)
  if (startHour != null && !deliveryStartStillAhead(d, startHour)) {
    return { ok: false, error: "Ce créneau a déjà commencé. Choisis une heure plus tard." }
  }
  const n = await countDeliverySlotOrders(d, s)
  if (deliverySlotIsFull(n)) {
    return {
      ok: false,
      error: `Ce créneau est complet (${DELIVERY_SLOT_CAPACITY} places, ${DELIVERY_SLOT_CLIENT_MAX} restantes affichées). Choisis un autre horaire.`,
    }
  }
  return { ok: true }
}

function hourFromLabel(label: string): number | null {
  const match = label.match(/(\d{1,2})\s*h/i)
  if (!match) return null
  const hour = Number(match[1])
  if (hour === 24) return 0
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  return hour
}

export async function remainingForSlot(date: string, slot: string): Promise<number> {
  return deliverySlotRemaining(await countDeliverySlotOrders(date, slot))
}
