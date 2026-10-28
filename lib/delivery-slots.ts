/** Capacité réelle d’un créneau livraison 2h. */
export const DELIVERY_SLOT_CAPACITY = 3
/** Place fantôme : toujours 1 prise pour montrer que le créneau tourne. */
export const DELIVERY_SLOT_RESERVED = 1
/** Places vraiment bookables par les commandes. */
export const DELIVERY_SLOT_CLIENT_MAX = DELIVERY_SLOT_CAPACITY - DELIVERY_SLOT_RESERVED

export function deliverySlotTakenDisplay(realCount: number): number {
  return Math.min(DELIVERY_SLOT_CAPACITY, DELIVERY_SLOT_RESERVED + Math.max(0, realCount))
}

export function deliverySlotRemaining(realCount: number): number {
  return Math.max(0, DELIVERY_SLOT_CAPACITY - deliverySlotTakenDisplay(realCount))
}

export function deliverySlotIsFull(realCount: number): boolean {
  return deliverySlotRemaining(realCount) <= 0
}

const DAY_ORDER = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

/** 00h–05h continue la soirée, donc après 23h. 11h reste avant 16h. */
export function deliverySlotRank(startHour: number): number {
  const h = Math.trunc(Number(startHour))
  if (!Number.isFinite(h)) return 0
  return h < 6 ? h + 24 : h
}

function dayRank(label: string): number {
  const first = (label.split(/\s+/)[0] ?? "").trim()
  const i = DAY_ORDER.indexOf(first)
  return i === -1 ? DAY_ORDER.length : i
}

export function compareDeliverySlots(
  a: { startHour: number; label: string },
  b: { startHour: number; label: string },
): number {
  return (
    dayRank(a.label) - dayRank(b.label) ||
    deliverySlotRank(a.startHour) - deliverySlotRank(b.startHour) ||
    a.label.localeCompare(b.label, "fr")
  )
}
