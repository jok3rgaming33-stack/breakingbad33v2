// Règle de fidélité : 1 € dépensé = 1 point.
export const EUROS_PER_POINT = 1

export function computeLoyaltyPoints(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.floor(total / EUROS_PER_POINT)
}

// Récompenses échangeables contre des points.
// minAmount = montant d'achat minimum requis pour utiliser le code généré.
export type LoyaltyReward = {
  points: number
  discount: number // en euros
  minAmount: number
  label: string
}

export const LOYALTY_REWARDS: LoyaltyReward[] = [
  { points: 300, discount: 10, minAmount: 50, label: "-10€" },
  { points: 500, discount: 20, minAmount: 100, label: "-20€" },
  { points: 800, discount: 30, minAmount: 150, label: "-30€" },
]

// ─── Paliers de fidélité (basés sur le total dépensé livré) ─────────────────

export type LoyaltyTierId = "bronze" | "silver" | "gold" | "platinum"

export type LoyaltyTier = {
  id: LoyaltyTierId
  label: string
  minSpent: number
  color: string // classes Tailwind badge
  perks: string[]
}

export const LOYALTY_TIERS: LoyaltyTier[] = [
  {
    id: "bronze",
    label: "Bronze",
    minSpent: 0,
    color: "bg-amber-700/20 text-amber-600 border-amber-700/40",
    perks: ["1€ dépensé = 1 point", "Échange de points en codes promo"],
  },
  {
    id: "silver",
    label: "Argent",
    minSpent: 100,
    color: "bg-zinc-400/20 text-zinc-300 border-zinc-400/40",
    perks: ["Tous les avantages Bronze", "Priorité relative en messagerie"],
  },
  {
    id: "gold",
    label: "Or",
    minSpent: 300,
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    perks: ["Tous les avantages Argent", "Accès anticipé aux drops (annonces)"],
  },
  {
    id: "platinum",
    label: "Platine",
    minSpent: 600,
    color: "bg-cyan-400/20 text-cyan-300 border-cyan-400/40",
    perks: ["Tous les avantages Or", "Support prioritaire + bonus parrainage"],
  },
]

/** Total dépensé sur commandes livrées → palier actuel + suivant */
export function getLoyaltyTier(totalSpentDelivered: number): {
  tier: LoyaltyTier
  next: LoyaltyTier | null
  progress: number // 0–1 vers le palier suivant
  spentToNext: number
} {
  const spent = Math.max(0, Number.isFinite(totalSpentDelivered) ? totalSpentDelivered : 0)
  let current = LOYALTY_TIERS[0]
  for (const t of LOYALTY_TIERS) {
    if (spent >= t.minSpent) current = t
  }
  const idx = LOYALTY_TIERS.findIndex((t) => t.id === current.id)
  const next = idx >= 0 && idx < LOYALTY_TIERS.length - 1 ? LOYALTY_TIERS[idx + 1] : null
  if (!next) {
    return { tier: current, next: null, progress: 1, spentToNext: 0 }
  }
  const span = next.minSpent - current.minSpent
  const into = spent - current.minSpent
  const progress = span > 0 ? Math.min(1, Math.max(0, into / span)) : 1
  return {
    tier: current,
    next,
    progress,
    spentToNext: Math.max(0, next.minSpent - spent),
  }
}

// ─── Parrainage ────────────────────────────────────────────────────────────

/** Points offerts au filleul à sa 1ʳᵉ commande livrée (avec un code parrain) */
export const REFERRAL_BONUS_REFEREE = 30
/** Points offerts au parrain à la 1ʳᵉ livraison du filleul */
export const REFERRAL_BONUS_REFERRER = 50
/** Bonus extra Platine pour le parrain (CA livré ≥ 600€) */
export const REFERRAL_BONUS_PLATINUM_EXTRA = 25

/** Génère un code parrain lisible (ex. HEIS-A3F9) à partir du pseudo + id */
export function buildReferralCode(pseudo: string, userId: number): string {
  const clean = (pseudo || "USER")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X")
  const suffix = (userId * 7919 + 42).toString(36).toUpperCase().slice(-4).padStart(4, "0")
  return `${clean}-${suffix}`
}
