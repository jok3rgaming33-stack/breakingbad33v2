// ─── Points de base ───────────────────────────────────────────────────────────
// 1 € dépensé (montant payé net) = 1 point, puis × multiplicateur de palier.

export const EUROS_PER_POINT = 1

export function computeLoyaltyPoints(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.floor(total / EUROS_PER_POINT)
}

/** Points crédités sur une commande livrée, avec multi de palier. */
export function computeTierPoints(orderTotal: number, multiplier: number): number {
  const base = computeLoyaltyPoints(orderTotal)
  if (base <= 0) return 0
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
  return Math.max(0, Math.floor(base * m))
}

/** Calcule points + CA qualifiant en rejouant les livraisons (multi palier). */
export function replayLoyaltyOrders(
  livreeOrders: {
    id: number
    total: number | null
    loyaltyDiscount?: number | null
    loyaltyPointsAwarded?: number | null
  }[],
  peakTierId?: string | null,
): { points: number; qualifyingSpend: number; netSpend: number } {
  const sorted = [...livreeOrders].sort((a, b) => a.id - b.id)
  let points = 0
  let qualifyingSpend = 0
  let netSpend = 0
  let runningQualifying = 0
  for (const o of sorted) {
    const net = Math.max(0, o.total ?? 0)
    const disc = Math.max(0, o.loyaltyDiscount ?? 0)
    const gross = net + disc
    const before = resolveEffectiveTier(runningQualifying, peakTierId)
    const awarded =
      o.loyaltyPointsAwarded != null && Number.isFinite(o.loyaltyPointsAwarded)
        ? Math.max(0, o.loyaltyPointsAwarded)
        : computeTierPoints(net, before.tier.pointsMultiplier)
    points += awarded
    netSpend += net
    qualifyingSpend += gross
    runningQualifying += gross
  }
  return { points, qualifyingSpend, netSpend }
}

// ─── Récompenses (bons) ───────────────────────────────────────────────────────
// minAmount = panier minimum pour utiliser le code.

export type LoyaltyReward = {
  points: number
  discount: number
  minAmount: number
  label: string
}

export const LOYALTY_REWARDS: LoyaltyReward[] = [
  { points: 300, discount: 10, minAmount: 50, label: "-10€" },
  { points: 600, discount: 20, minAmount: 100, label: "-20€" },
  { points: 900, discount: 30, minAmount: 150, label: "-30€" },
]

// ─── Paliers ──────────────────────────────────────────────────────────────────

export type LoyaltyTierId = "bronze" | "silver" | "gold" | "platinum"

export type LoyaltyTier = {
  id: LoyaltyTierId
  label: string
  minSpent: number
  /** Multiplicateur de points sur chaque commande livrée */
  pointsMultiplier: number
  /** Emoji affiché à côté du pseudo (client + admin) */
  emoji: string
  /** File messagerie prioritaire côté admin */
  priorityMessaging: boolean
  /** Réservation produit avant les autres */
  canReserve: boolean
  /** Livraison offerte 1 mois (commandes ≥ freeDeliveryMinOrder) */
  freeDelivery: boolean
  freeDeliveryMinOrder: number
  color: string
  perks: string[]
}

/**
 * Seuils de palier en **points de statut** (1€ payé hors remise fidélité = 1 pt statut).
 * Le solde de points (avec multi) peut différer ; le palier suit ces pts de statut cumulés.
 */
export const LOYALTY_TIERS: LoyaltyTier[] = [
  {
    id: "bronze",
    label: "Bronze",
    minSpent: 0,
    pointsMultiplier: 1,
    emoji: "",
    priorityMessaging: false,
    canReserve: false,
    freeDelivery: false,
    freeDeliveryMinOrder: 0,
    color: "bg-amber-700/20 text-amber-600 border-amber-700/40",
    perks: [
      "1€ payé = 1 point (base)",
      "Échange de points en bons -10 / -20 / -30€",
      "Parrainage à la 1ʳᵉ livraison du filleul",
    ],
  },
  {
    id: "silver",
    label: "Argent",
    minSpent: 100,
    pointsMultiplier: 1.1,
    emoji: "🥈",
    priorityMessaging: false,
    canReserve: false,
    freeDelivery: false,
    freeDeliveryMinOrder: 0,
    color: "bg-zinc-400/20 text-zinc-300 border-zinc-400/40",
    perks: [
      "Dès 100 pts de statut",
      "+10 % de points sur chaque commande livrée",
      "Bon -10€ toujours à 300 pts",
      "Tous les avantages Bronze",
    ],
  },
  {
    id: "gold",
    label: "Or",
    minSpent: 300,
    pointsMultiplier: 1.2,
    emoji: "🥇",
    priorityMessaging: true,
    canReserve: false,
    freeDelivery: false,
    freeDeliveryMinOrder: 0,
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    perks: [
      "Dès 300 pts de statut",
      "+20 % de points sur chaque commande livrée",
      "Priorité messagerie (file admin + badge)",
      "Emoji 🥇 à côté de ton pseudo",
      "Bon -20€ à 600 pts",
      "Tous les avantages Argent",
    ],
  },
  {
    id: "platinum",
    label: "Platine",
    minSpent: 600,
    pointsMultiplier: 1.3,
    emoji: "💎",
    priorityMessaging: true,
    canReserve: true,
    freeDelivery: true,
    freeDeliveryMinOrder: 90,
    color: "bg-cyan-400/20 text-cyan-300 border-cyan-400/40",
    perks: [
      "Dès 600 pts de statut",
      "+30 % de points sur chaque commande livrée",
      "Emoji 💎 — statut premium",
      "Réservation produit (sécurise ton article 48 h)",
      "Fenêtre Platine : livraison offerte 30 jours sur commandes ≥ 90€",
      "Hors fenêtre : livraison offerte contre 150 pts par commande (si solde OK)",
      "Bon -30€ à 900 pts",
      "Bonus parrainage renforcé",
      "Tous les avantages Or",
    ],
  },
]

const TIER_RANK: Record<LoyaltyTierId, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
}

export function tierRank(id: LoyaltyTierId | string | null | undefined): number {
  if (!id) return 0
  return TIER_RANK[id as LoyaltyTierId] ?? 0
}

export function getTierById(id: LoyaltyTierId | string | null | undefined): LoyaltyTier {
  return LOYALTY_TIERS.find((t) => t.id === id) ?? LOYALTY_TIERS[0]
}

export function maxTierId(a: LoyaltyTierId, b: LoyaltyTierId): LoyaltyTierId {
  return tierRank(a) >= tierRank(b) ? a : b
}

/** Total « statut » (CA qualifiant) → palier théorique + progression */
export function getLoyaltyTier(totalSpentDelivered: number): {
  tier: LoyaltyTier
  next: LoyaltyTier | null
  progress: number
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

/**
 * Palier effectif = max(palier calculé sur CA, palier plancher / pic).
 * → un bon utilisé ne rétrograde jamais le client.
 */
export function resolveEffectiveTier(
  qualifyingSpend: number,
  peakTierId?: LoyaltyTierId | string | null,
): {
  tier: LoyaltyTier
  next: LoyaltyTier | null
  progress: number
  spentToNext: number
  fromPeak: boolean
} {
  const calc = getLoyaltyTier(qualifyingSpend)
  const peak = getTierById(peakTierId)
  if (tierRank(peak.id) > tierRank(calc.tier.id)) {
    // Garde le palier pic ; progression affichée vers le suivant du pic (ou max)
    const idx = LOYALTY_TIERS.findIndex((t) => t.id === peak.id)
    const next = idx >= 0 && idx < LOYALTY_TIERS.length - 1 ? LOYALTY_TIERS[idx + 1] : null
    if (!next) {
      return { tier: peak, next: null, progress: 1, spentToNext: 0, fromPeak: true }
    }
    // Progression vers le palier suivant du pic, basée sur le CA réel
    const span = next.minSpent - peak.minSpent
    const into = qualifyingSpend - peak.minSpent
    const progress = span > 0 ? Math.min(1, Math.max(0, into / span)) : 0
    return {
      tier: peak,
      next,
      progress,
      spentToNext: Math.max(0, next.minSpent - qualifyingSpend),
      fromPeak: true,
    }
  }
  return { ...calc, fromPeak: false }
}

/** Pseudo + emoji de palier (Or / Platine surtout). */
export function formatPseudoWithTier(
  pseudo: string,
  tierId?: LoyaltyTierId | string | null,
): string {
  const t = getTierById(tierId)
  if (!t.emoji) return pseudo
  return `${t.emoji} ${pseudo}`
}

// ─── Impact des bons (sans dégoûter) ──────────────────────────────────────────
/**
 * Règle win-win :
 * 1) Les POINTS sont calculés sur le montant PAYÉ (net) × multi palier.
 *    → utiliser un -20€ réduit les points de CETTE commande (coût naturel du bon).
 * 2) Le STATUT / palier regarde le CA « qualifiant » = net + remise fidélité
 *    (on ne te fait pas perdre le fruit d’un gros panier à cause du bon).
 * 3) Le palier ne DESCEND JAMAIS (peak_tier) une fois atteint.
 *
 * Résultat : le bon a un vrai coût (points + un peu de progression brute),
 * mais tu ne redescends pas d’Or à Argent en l’utilisant.
 */

export const FREE_DELIVERY_DAYS = 30
export const PLATINUM_FREE_DELIVERY_MIN = 90
/** Après le mois offert : coût en points pour une livraison gratuite (Platine). */
export const PLATINUM_FREE_DELIVERY_POINTS_COST = 150
export const PRODUCT_RESERVE_HOURS = 48

/** Démarre le mois offert uniquement à la 1ʳᵉ atteinte Platine (jamais de renouvellement auto). */
export function shouldGrantPlatinumFreeMonth(opts: {
  wasAlreadyPlatinum: boolean
  freeDeliveryUntil: Date | string | null | undefined
}): boolean {
  // Déjà eu une date (même expirée) → ne jamais re-accorder automatiquement
  if (opts.freeDeliveryUntil) return false
  // Première fois platine OU platine legacy sans date → accorder 30 jours
  return true
}

export function computeFreeDeliveryUntil(from = new Date()): Date {
  return new Date(from.getTime() + FREE_DELIVERY_DAYS * 86400000)
}

// ─── Parrainage ───────────────────────────────────────────────────────────────

export const REFERRAL_BONUS_REFEREE = 30
export const REFERRAL_BONUS_REFERRER = 50
export const REFERRAL_BONUS_PLATINUM_EXTRA = 25

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

/** Normalise une saisie code parrain (casse, espaces, tirets unicode). */
export function normalizeReferralCode(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
}
