// Configuration centralisée des statuts de commande (côté vendeur + client)

export type OrderStatusMeta = {
  key: string
  label: string
  // Classe pour les puces / badges
  badge: string
  // Classe pour le point de couleur
  dot: string
}

// Statut par défaut tant que le vendeur n'a rien choisi
export const PENDING_STATUS: OrderStatusMeta = {
  key: "en_attente",
  label: "En attente de validation",
  badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  dot: "bg-yellow-400",
}

// Statuts sélectionnables par le vendeur, dans l'ordre du cycle de vie
export const ORDER_STATUSES: OrderStatusMeta[] = [
  {
    key: "validee",
    label: "Validée",
    badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    dot: "bg-blue-400",
  },
  {
    key: "preparation",
    label: "En cours de préparation",
    badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    dot: "bg-orange-400",
  },
  {
    key: "livraison",
    label: "En livraison",
    badge: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  {
    key: "livree",
    label: "Livrée",
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  {
    key: "annulee",
    label: "Annulée",
    badge: "bg-red-500/15 text-red-400 border border-red-500/30",
    dot: "bg-red-400",
  },
]

// Statuts terminaux -> "Mes commandes passées"
export const PAST_STATUS_KEYS = ["livree", "annulee"]

const ALL = [PENDING_STATUS, ...ORDER_STATUSES]

// Renvoie la meta du statut, avec repli sur "En attente de validation"
// (gère aussi les anciens statuts: nouveau / en cours / traité)
export function getStatusMeta(status: string | null | undefined): OrderStatusMeta {
  return ALL.find((s) => s.key === status) ?? PENDING_STATUS
}

export function isPastStatus(status: string | null | undefined): boolean {
  return PAST_STATUS_KEYS.includes(status ?? "")
}
