// Définition des bandeaux produits (partagée client + serveur).

export const BADGE_OPTIONS = [
  { key: "best_seller", label: "Best-seller", className: "bg-[#3e6757] text-white" },
  { key: "reappro", label: "Rupture", className: "bg-red-600 text-white" },
  { key: "arrivage", label: "Arrivage", className: "bg-sky-400 text-white" },
  { key: "fin_de  _stock", label: "Bientôt épuisé", className: "bg-yellow-500 text-black" },
] as const

export type BadgeKey = (typeof BADGE_OPTIONS)[number]["key"]

export function badgeMeta(key: string | null | undefined) {
  return BADGE_OPTIONS.find((b) => b.key === key) ?? null
}
