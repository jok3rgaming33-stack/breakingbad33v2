/** Règles visibles et serveur : un commentaire ouvre un tour, dans ces limites. */
export const REVIEW_COMMENT_MIN = 50
export const REVIEW_SPINS_PER_PRODUCT = 2
export const REVIEW_SPINS_PER_ORDER = 2

export const RATING_INVITE_TAG = "[NOTER_PRODUITS]"

export function ratingInviteBody(): string {
  return [
    RATING_INVITE_TAG,
    "Un commentaire d'au moins 50 caractères ouvre un tour sur Albuquerque Luck Spin.",
    "2 tours maximum par commande. Chaque produit peut en ouvrir 2 : le second seulement si tu le rachètes.",
    "Le tour est valable 7 jours. Les étoiles seules ne comptent pas.",
  ].join("\n")
}

export function ratingInvitePushBody(): string {
  return "Un commentaire de 50 caractères peut ouvrir un tour sur la roue."
}
