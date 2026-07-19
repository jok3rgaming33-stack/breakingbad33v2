// Statuts de commande partagés entre la messagerie vendeur et l'espace client.

export const ORDER_STATUS_DEFAULT = "en_attente"

// Options sélectionnables par le vendeur pour les commandes
export const VENDOR_STATUS_OPTIONS = [
  "validee",
  "preparation",
  "pret_meetup",
  "livraison",
  "livree",
  "annulee",
] as const

// Options sélectionnables par le vendeur pour les discussions directes
export const VENDOR_DISCUSSION_STATUS_OPTIONS = [
  "pris_en_charge",
  "ouvert",
  "ferme",
] as const

export type OrderStatusKey =
  | "discussion"
  | "pris_en_charge"
  | "ouvert"
  | "ferme"
  | "en_attente"
  | "validee"
  | "preparation"
  | "pret_meetup"
  | "livraison"
  | "livree"
  | "annulee"

type StatusMeta = {
  label: string
  // Classes Tailwind pour le badge (fond + texte)
  badge: string
  // Classe de texte/accent seule (ex. select)
  accent: string
}

export const STATUS_META: Record<string, StatusMeta> = {
  discussion: {
    label: "Discussion",
    badge: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
    accent: "text-teal-300",
  },
  pris_en_charge: {
    label: "Pris en charge",
    badge: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
    accent: "text-sky-400",
  },
  ouvert: {
    label: "Ouvert",
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    accent: "text-emerald-400",
  },
  ferme: {
    label: "Fermé",
    badge: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
    accent: "text-zinc-400",
  },
  en_attente: {
    label: "En attente de validation",
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    accent: "text-amber-400",
  },
  validee: {
    label: "Validée",
    badge: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
    accent: "text-sky-400",
  },
  preparation: {
    label: "En cours de préparation",
    badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    accent: "text-orange-400",
  },
  pret_meetup: {
    label: "Colis prêt à récupérer",
    badge: "bg-violet-500/15 text-violet-400 border border-violet-500/30",
    accent: "text-violet-400",
  },
  livraison: {
    label: "En livraison",
    badge: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
    accent: "text-indigo-300",
  },
  livree: {
    label: "Livrée",
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    accent: "text-emerald-400",
  },
  annulee: {
    label: "Annulée",
    badge: "bg-red-500/15 text-red-400 border border-red-500/30",
    accent: "text-red-400",
  },
}

// Normalise un statut stocké (gère les anciens libellés) vers une clé connue
export function normalizeStatus(raw: string | null | undefined): OrderStatusKey {
  if (!raw) return "en_attente"
  const key = raw.trim().toLowerCase()
  if (key in STATUS_META) return key as OrderStatusKey
  // Compat anciens libellés
  if (key === "nouveau" || key === "en cours" || key === "en_cours") return "en_attente"
  if (key === "traité" || key === "traite") return "livree"
  // Discussion statuses passés directement
  if (key === "pris_en_charge" || key === "ouvert" || key === "ferme") return key as OrderStatusKey
  return "en_attente"
}

export function statusMeta(raw: string | null | undefined): StatusMeta {
  return STATUS_META[normalizeStatus(raw)]
}

// Statuts considérés comme "terminés" (commandes passées)
export const CLOSED_STATUSES: OrderStatusKey[] = ["livree", "annulee"]

export function isClosedStatus(raw: string | null | undefined): boolean {
  return CLOSED_STATUSES.includes(normalizeStatus(raw))
}

// Statuts discussion (fils directs entre client et admin)
export const DISCUSSION_STATUSES: OrderStatusKey[] = ["discussion", "pris_en_charge", "ouvert", "ferme"]

export function isDiscussionStatus(raw: string | null | undefined): boolean {
  const k = normalizeStatus(raw)
  return DISCUSSION_STATUSES.includes(k) || raw === "discussion" || raw === "pris_en_charge" || raw === "ouvert" || raw === "ferme"
}
