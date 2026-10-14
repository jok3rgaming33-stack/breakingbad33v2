/** Règles visibles et serveur : un commentaire ouvre un tour, dans ces limites. */
export const REVIEW_COMMENT_MIN = 50
export const REVIEW_SPINS_PER_PRODUCT = 2
export const REVIEW_SPINS_PER_ORDER = 2

/**
 * Pas de rétroactivité. Seules les commandes créées à partir de cet instant
 * peuvent ouvrir un tour. La commande déjà en cours à l'ouverture est incluse.
 * Tout ce qui a été passé avant ne donne pas de tour.
 */
export const REVIEW_SPIN_FROM_MS = Date.parse("2026-10-14T19:59:09.622Z")

export const RATING_INVITE_TAG = "[NOTER_PRODUITS]"
/** Présent seulement quand le message promet un tour. Le client ne le voit pas. */
export const WHEEL_LINK_TAG = "[ROUE]"

export function orderEarnsReviewSpin(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false
  const at = new Date(createdAt).getTime()
  return Number.isFinite(at) && at >= REVIEW_SPIN_FROM_MS
}

export function ratingInviteBody(withSpin = true): string {
  if (!withSpin) {
    return [
      RATING_INVITE_TAG,
      "Chaque avis compte — surtout le tien.",
      "Même si tu as déjà noté ce produit, un nouveau retour à chaque commande montre que tu reviens, et ça rassure ceux qui découvrent encore le labo.",
      "1 minute, et tu aides tout le monde.",
    ].join("\n")
  }
  return [
    RATING_INVITE_TAG,
    WHEEL_LINK_TAG,
    "Un commentaire d'au moins 50 caractères ouvre un tour sur Albuquerque Luck Spin.",
    "2 tours maximum par commande. Chaque produit peut en ouvrir 2 : le second seulement si tu le rachètes.",
    "Le tour est valable 7 jours. Les étoiles seules ne comptent pas.",
  ].join("\n")
}

export function ratingInvitePushBody(withSpin = true): string {
  return withSpin
    ? "Un commentaire de 50 caractères peut ouvrir un tour sur la roue."
    : "Même si tu l'as déjà fait : un nouvel avis à chaque commande, ça compte."
}
