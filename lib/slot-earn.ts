/** Réglage public du gain de tours. Pas de probabilités ici. */
export const DEFAULT_SPIN_EUROS = 50
export const SPIN_CAP = 10
export const SPIN_EUROS_MAX = 500

export type SpinEarnConfig = {
  /** Montant de produits, en euros, pour 1 tour. */
  eurosPerSpin: number
  /** Fin de l'offre « x2 ». Null = pas de double. */
  doubleUntil: string | null
}

export const DEFAULT_SPIN_EARN: SpinEarnConfig = {
  eurosPerSpin: DEFAULT_SPIN_EUROS,
  doubleUntil: null,
}

export function normalizeSpinEarn(value: unknown): SpinEarnConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const euros = Math.trunc(Number(raw.eurosPerSpin))
  const until = typeof raw.doubleUntil === "string" ? raw.doubleUntil : null
  return {
    eurosPerSpin:
      Number.isFinite(euros) && euros >= 1 && euros <= SPIN_EUROS_MAX ? euros : DEFAULT_SPIN_EUROS,
    doubleUntil: until && Number.isFinite(Date.parse(until)) ? until : null,
  }
}

export function spinMultiplier(cfg: SpinEarnConfig, now = new Date()): 1 | 2 {
  if (!cfg.doubleUntil) return 1
  const until = Date.parse(cfg.doubleUntil)
  return Number.isFinite(until) && until > now.getTime() ? 2 : 1
}

export function countOrderSpins(
  cents: number,
  blocked: boolean,
  cfg: SpinEarnConfig,
  now = new Date(),
): number {
  if (blocked) return 0
  const threshold = cfg.eurosPerSpin * 100
  if (!Number.isFinite(cents) || cents < threshold) return 0
  const mult = spinMultiplier(cfg, now)
  return Math.min(SPIN_CAP * mult, Math.floor(cents / threshold) * mult)
}

function euroLabel(euros: number): string {
  return `${euros}€`
}

function parisUntil(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function spinEarnIntro(cfg: SpinEarnConfig, now = new Date()): string {
  const mult = spinMultiplier(cfg, now)
  const euros = euroLabel(cfg.eurosPerSpin)
  if (mult === 2 && cfg.doubleUntil) {
    return `2 tours par tranche de ${euros} de produits, hors livraison, jusqu'au ${parisUntil(cfg.doubleUntil)}. Ensuite, 1 tour par tranche. Le palier Ultimate ouvre en plus un tour gratuit à réclamer. Les chances ne sont pas affichées.`
  }
  return `1 tour par tranche de ${euros} de produits, hors livraison. Le palier Ultimate ouvre en plus un tour gratuit à réclamer. Les chances ne sont pas affichées.`
}

export function spinEarnRuleBody(cfg: SpinEarnConfig, now = new Date()): string {
  const euros = cfg.eurosPerSpin
  const mult = spinMultiplier(cfg, now)
  const per = mult === 2 ? "2 tours" : "1 tour"
  const cap = SPIN_CAP * mult
  const under = (euros - 0.01).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const at = mult === 2 ? `${euros * 2}€ = 4 tours` : `${euros * 2}€ = 2 tours`
  const window =
    mult === 2 && cfg.doubleUntil ? ` Offre x2 jusqu'au ${parisUntil(cfg.doubleUntil)}.` : ""
  return `${per} par tranche de ${euros}€ de produits, après les remises déjà appliquées. La livraison, le pourboire et l'avoir ne comptent pas. ${under}€ = 0 tour, ${euros}€ = ${mult} tour${mult > 1 ? "s" : ""}, ${at}. Maximum ${cap} tours par commande.${window} Uniquement sur un compte connecté, une fois le paiement confirmé (espèces : commande livrée ; Monero locker : paiement confirmé). Chaque tour expire 7 jours après son attribution. Les commandes passées avant l'ouverture d'Albuquerque Luck Spin ne donnent rien. Les tours déjà crédités ne sont pas recalculés.`
}
