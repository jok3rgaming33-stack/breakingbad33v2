/** Textes et visuels de la machine. Aucune pondération ici : le client ne les reçoit pas. */

export type SlotSymbol = "walter" | "jesse" | "gus" | "badger" | "tuco" | "crystal"

export const SLOT_SYMBOLS: { id: SlotSymbol; name: string; src: string; crop?: string }[] = [
  { id: "badger", name: "Badger", src: "/slot/badger.webp" },
  { id: "tuco", name: "Tuco", src: "/slot/tuco.jpg" },
  { id: "crystal", name: "Cristal bleu", src: "/slot/crystal.jpg", crop: "center 30%" },
  { id: "gus", name: "Gus", src: "/slot/gus.jpg" },
  { id: "jesse", name: "Jesse", src: "/slot/jesse.webp" },
  { id: "walter", name: "Walter", src: "/slot/walter.png" },
]

export function symbolSrc(id: string): string {
  return SLOT_SYMBOLS.find((s) => s.id === id)?.src ?? "/slot/crystal.jpg"
}

export function symbolCrop(id: string): string {
  return SLOT_SYMBOLS.find((s) => s.id === id)?.crop ?? "center"
}

export type PrizeCard = {
  id: SlotSymbol
  title: string
  gain: string
  detail: string
}

export const PRIZE_CARDS: PrizeCard[] = [
  {
    id: "walter",
    title: "Walter",
    gain: "Bon −20€",
    detail:
      "Sur une prochaine commande, dès 60€ de produits. Valable 30 jours, lié à ton compte, non cessible. Pas de monnaie. Ne se cumule pas avec un code promo ni un code fidélité.",
  },
  {
    id: "jesse",
    title: "Jesse",
    gain: "Bon −10€",
    detail:
      "Même règle que Walter : dès 60€ de produits, 30 jours, non cessible, pas de cumul avec un autre code.",
  },
  {
    id: "gus",
    title: "Gus",
    gain: "Livraison offerte",
    detail:
      "Calculée sur l'adresse de la commande qui utilise le bon, avec le barème du shop. Si la livraison est déjà offerte, ou si tu retires (meet-up ou locker), le bon devient 150 points.",
  },
  {
    id: "badger",
    title: "Badger",
    gain: "150 points",
    detail: "Points de fidélité, ajoutés à ton solde. Ils ne changent pas ton palier de statut.",
  },
  {
    id: "crystal",
    title: "Cristal bleu",
    gain: "1 tour en plus",
    detail:
      "Crédité tout de suite, et il expire aussi sous 7 jours. Une série s'arrête au 5ᵉ tour supplémentaire : le cristal suivant vaut 150 points.",
  },
  {
    id: "tuco",
    title: "Tuco",
    gain: "Tour consommé",
    detail: "Trois Tuco alignés ne donnent aucun lot. Le tour est joué.",
  },
]

export type MachineVoucherView = {
  code: string
  kind: string
  label: string
  expiresAt: string | null
}

export type UltimateView = {
  stopped: boolean
  anchorAt: string | null
  canClaim: boolean
  claimHint: string
  claimsUsed: number
  evalEuros: number | null
  evalNeed: number | null
}

export type MachineState = {
  loggedIn: boolean
  pseudo: string | null
  tierLabel: string | null
  tierEmoji: string | null
  isUltimate: boolean
  available: number
  soonestExpiry: string | null
  last: { symbols: string[]; outcome: string; label: string; at: string } | null
  vouchers: MachineVoucherView[]
  ultimate: UltimateView | null
}

export type PlayResult =
  | { ok: true; symbols: string[]; outcome: string; label: string; available: number; trial?: boolean }
  | { ok: false; error: string }

export const RULES: { title: string; body: string }[] = [
  {
    title: "Comment obtenir un tour",
    body: "1 tour par tranche de 60€ de produits, après les remises déjà appliquées. La livraison, le pourboire et l'avoir ne comptent pas. 59,99€ = 0 tour, 60€ = 1 tour. Maximum 10 tours par commande. Uniquement sur un compte connecté, une fois le paiement confirmé (espèces : commande livrée ; Monero locker : paiement confirmé). Chaque tour expire 7 jours après son attribution. Les commandes passées avant l'ouverture d'Albuquerque Luck Spin ne donnent rien.",
  },
  {
    title: "Ce qui ne donne aucun tour",
    body: "Une commande payée avec un bon Albuquerque Luck Spin, ou avec un code généré par tes points fidélité, ne crédite aucun tour. Retirer la remise du calcul ne suffit pas.",
  },
  {
    title: "Comment gagner",
    body: "3 précurseurs identiques sur la ligne. Tout le reste est un tour sans lot. Les gains sont des avantages boutique : bons, livraison, points ou tours.",
  },
  {
    title: "Les bons",
    body: "Walter et Jesse agissent sur les produits, Gus sur la livraison : ces deux familles peuvent être actives en même temps. Tu ne gardes qu'un seul bon produits : si tu en gagnes un second alors que le premier n'est pas utilisé, le plus intéressant reste, l'autre tombe. Un bon Albuquerque Luck Spin ne se cumule pas avec un code promo ni un code fidélité.",
  },
  {
    title: "Ultimate",
    body: "Le palier Ultimate (👑) s'atteint à 1 200 points de statut. Il est permanent, comme les autres, et il n'y a pas de rattrapage. C'est ce palier qui ouvre 1 tour gratuit tous les 30 jours, 3 par cycle, à réclamer sur cette page. Le compteur part de la première commande qui crédite un tour payant après l'ouverture : une fenêtre manquée est perdue. Après le 3ᵉ tour gratuit, il faut 300€ de produits commandés et payés en 30 jours pour relancer un cycle. Sinon, le droit s'arrête. Le tour gratuit expire 7 jours après la réclamation.",
  },
]
