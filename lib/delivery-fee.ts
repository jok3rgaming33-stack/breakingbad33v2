/** Frais locker Mondial Relay. */
export const FEE_LOCKER = 10

/** 0–10 km : 10€ | 10–20 km : 20€ | >20 km : 20€ + 1€ par km supplémentaire */
export function calcDeliveryFee(km: number): number {
  if (km <= 10) return 10
  if (km <= 20) return 20
  return 20 + Math.ceil(km - 20)
}

/** Livraison offerte si le panier atteint le palier du rayon. */
export const FREE_DELIVERY_TIERS = [
  { minAmount: 100, maxKm: 10 },
  { minAmount: 200, maxKm: 20 },
  { minAmount: 300, maxKm: 30 },
] as const

export type FreeDeliveryTier = (typeof FREE_DELIVERY_TIERS)[number]

export function matchingFreeDeliveryTier(
  subtotal: number,
  km: number,
): FreeDeliveryTier | null {
  return FREE_DELIVERY_TIERS.find((t) => subtotal >= t.minAmount && km <= t.maxKm) ?? null
}

export function isThresholdFreeDelivery(subtotal: number, km: number): boolean {
  return matchingFreeDeliveryTier(subtotal, km) != null
}

export function freeDeliveryTierLabel(tier: FreeDeliveryTier): string {
  return `${tier.minAmount}€ / ${tier.maxKm} km`
}

/** Palier encore à atteindre pour cette distance (ou null si déjà offert / hors zone). */
export function nextFreeDeliveryHint(
  subtotal: number,
  km: number,
): { need: number; minAmount: number; maxKm: number } | null {
  const covering = FREE_DELIVERY_TIERS.find((t) => km <= t.maxKm)
  if (!covering) return null
  if (subtotal >= covering.minAmount) return null
  return {
    need: Math.ceil(covering.minAmount - subtotal),
    minAmount: covering.minAmount,
    maxKm: covering.maxKm,
  }
}
