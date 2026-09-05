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

export function deliverySlotRemainingLabel(realCount: number): string {
  const n = deliverySlotRemaining(realCount)
  if (n <= 0) return "Complet"
  if (n === 1) return "1 place restante"
  return `${n} places restantes`
}
