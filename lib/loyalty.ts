// Règle de fidélité : 1 point crédité par tranche de 20€ dépensés.
export const EUROS_PER_POINT = 20

export function computeLoyaltyPoints(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.floor(total / EUROS_PER_POINT)
}
