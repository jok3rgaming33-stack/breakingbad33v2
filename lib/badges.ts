// Définition des bandeaux produits (partagée client + serveur).
// Un produit peut porter plusieurs bandeaux simultanément.

export const BADGE_OPTIONS = [
  { key: "best_seller", label: "Best-seller", className: "bg-[#3e6757] text-white" },
  { key: "top_seller", label: "Top Seller", className: "bg-indigo-600 text-white" },
  { key: "promo", label: "Promo", className: "bg-red-600 text-white" },
  { key: "nouveau", label: "Nouveau", className: "bg-sky-500 text-black" },
  { key: "arrivage", label: "Arrivage", className: "bg-sky-400 text-black" },
  { key: "reappro", label: "En réappro", className: "bg-amber-500 text-black" },
  { key: "fin_de_stock", label: "Fin de stock", className: "bg-zinc-600 text-white" },
] as const

export type BadgeKey = (typeof BADGE_OPTIONS)[number]["key"]

// Seuil de stock à partir duquel le badge "En réappro" est suggéré/auto-appliqué.
export const LOW_STOCK_THRESHOLD = 5

export function badgeMeta(key: string | null | undefined) {
  return BADGE_OPTIONS.find((b) => b.key === key) ?? null
}

// Calcule la liste de badges à afficher : badges manuels + "En réappro" auto si stock bas.
export function resolveBadges(manual: string[] | null | undefined, stock: number): string[] {
  const list = Array.isArray(manual) ? [...manual] : []
  if (stock <= LOW_STOCK_THRESHOLD && !list.includes("reappro")) {
    list.push("reappro")
  }
  return list
}
