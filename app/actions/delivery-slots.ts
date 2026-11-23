"use server"

import { db } from "@/lib/db"
import { orderThreads } from "@/lib/db/schema"
import { and, eq, notInArray, sql } from "drizzle-orm"
import { deliverySlotIsFull, deliverySlotRemaining } from "@/lib/delivery-slots"
import { addDaysStr, deliveryStartStillAhead, frDayName, parisParts, slotMatchesDay } from "@/lib/paris-clock"
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

type Mode = "livraison" | "meetup"

async function countSlotOrders(mode: Mode, date: string, slot: string): Promise<number> {
  const d = date.trim()
  const s = slot.trim()
  if (!d || !s) return 0
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.fulfillment, mode),
        eq(orderThreads.scheduledDate, d),
        eq(orderThreads.scheduledSlot, s),
        notInArray(orderThreads.status, FREE_STATUSES),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

async function slotOccupancy(mode: Mode, date: string): Promise<Record<string, number>> {
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
        eq(orderThreads.fulfillment, mode),
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

// ─── Livraison ──────────────────────────────────────────────────────────────

export async function countDeliverySlotOrders(date: string, slot: string): Promise<number> {
  return countSlotOrders("livraison", date, slot)
}

/** Occupancy réelle par label de créneau, pour une date (livraison). */
export async function getDeliverySlotOccupancy(date: string): Promise<Record<string, number>> {
  return slotOccupancy("livraison", date)
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
      error: "Ce créneau est complet. Choisis un autre horaire.",
    }
  }
  return { ok: true }
}

// ─── Meet-up (retrait) ──────────────────────────────────────────────────────

export async function countMeetupSlotOrders(date: string, slot: string): Promise<number> {
  return countSlotOrders("meetup", date, slot)
}

/** Occupancy réelle par label de créneau, pour une date (meet-up). */
export async function getMeetupSlotOccupancy(date: string): Promise<Record<string, number>> {
  return slotOccupancy("meetup", date)
}

export async function assertMeetupSlotAvailable(
  date: string | undefined,
  slot: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = date?.trim() ?? ""
  const s = slot?.trim() ?? ""
  if (!d || !s) return { ok: false, error: "Choisis une date et un créneau de meet-up." }
  const cfg = await getCartConfig()
  const known = cfg.meetupSlots.find((slot) => slot.label === s)
  if (known && !slotMatchesDay(known, frDayName(d))) {
    return { ok: false, error: "Ce créneau n'est pas proposé ce jour-là." }
  }
  const startHour = known?.hour ?? hourFromLabel(s)
  if (startHour != null && !deliveryStartStillAhead(d, startHour)) {
    return { ok: false, error: "Ce créneau a déjà commencé. Choisis une heure plus tard." }
  }
  const n = await countMeetupSlotOrders(d, s)
  if (deliverySlotIsFull(n)) {
    return { ok: false, error: "Ce créneau est complet. Choisis un autre horaire." }
  }
  return { ok: true }
}

// ─── Bascule sur le jour suivant ────────────────────────────────────────────

/**
 * Premier jour (à partir d'aujourd'hui, Paris) qui a encore au moins un créneau libre :
 * bon jour de semaine, pas déjà commencé, pas déjà pris.
 * Quand les 12 créneaux du jour sont pris, renvoie donc le lendemain.
 */
export async function getNextAvailableDate(mode: Mode, maxDays = 30): Promise<string | null> {
  const cfg = await getCartConfig()
  const slots: { label: string; startHour: number; days?: string[] }[] =
    mode === "livraison"
      ? cfg.deliverySlots
      : cfg.meetupSlots.map((s) => ({ label: s.label, startHour: s.hour, days: s.days }))
  if (slots.length === 0) return null

  const p = parisParts(new Date())
  const pad = (n: number) => String(n).padStart(2, "0")
  const today = `${p.year}-${pad(p.month)}-${pad(p.day)}`

  for (let i = 0; i < maxDays; i++) {
    const date = addDaysStr(today, i)
    const dayName = frDayName(date)
    const occ = await slotOccupancy(mode, date)
    const hasFree = slots.some(
      (s) =>
        slotMatchesDay(s, dayName) &&
        deliveryStartStillAhead(date, s.startHour) &&
        !deliverySlotIsFull(occ[s.label] ?? 0),
    )
    if (hasFree) return date
  }
  return null
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
