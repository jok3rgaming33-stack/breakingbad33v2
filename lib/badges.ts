// Définition des bandeaux produits (partagée client + serveur).
// Un produit peut porter plusieurs bandeaux simultanément.

export const BADGE_OPTIONS = [
  { key: "best_seller", label: "Best-seller", className: "bg-[#3e6757] text-white" },
  { key: "bépuisé", label: "Bientôt Épuisé", className: "bg-indigo-600 text-white" },
  { key: "promo", label: "Promo", className: "bg-red-600 text-white" },
  { key: "nouveau", label: "Nouveau", className: "bg-sky-500 text-black", featured: true },
  // Arrivage : clignote (badge-blink) + mise en avant catalogue
  {
    key: "arrivage",
    label: "Arrivage",
    className: "bg-sky-400 text-black",
    featured: true,
    blink: true,
  },
  { key: "reappro", label: "En réappro", className: "bg-amber-500 text-black" },
  { key: "rupture", label: "Rupture", className: "bg-zinc-600 text-white" },
  { key: "bientot_dispo", label: "Bientôt dispo", className: "bg-teal-600 text-white" },
  { key: "fin_de_stock", label: "Fin de stock", className: "bg-orange-600 text-white" },
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

/** Produit mis en avant : Arrivage et/ou Nouveau. */
export function isFeaturedProduct(badges: string[] | null | undefined): boolean {
  if (!Array.isArray(badges)) return false
  return badges.includes("arrivage") || badges.includes("nouveau")
}

/** @deprecated alias — préférer isFeaturedProduct */
export function isFeaturedArrivage(badges: string[] | null | undefined): boolean {
  return isFeaturedProduct(badges)
}

/** Trie : arrivage/nouveau en tête, reste dans l’ordre d’origine. */
export function sortProductsFeaturedFirst<T extends { badges?: string[] | null }>(
  products: T[],
): T[] {
  return [...products].sort((a, b) => {
    const fa = isFeaturedProduct(a.badges) ? 0 : 1
    const fb = isFeaturedProduct(b.badges) ? 0 : 1
    // Parmi les mis en avant : arrivage avant nouveau seul
    if (fa === 0 && fb === 0) {
      const aa = Array.isArray(a.badges) && a.badges.includes("arrivage") ? 0 : 1
      const ab = Array.isArray(b.badges) && b.badges.includes("arrivage") ? 0 : 1
      return aa - ab
    }
    return fa - fb
  })
}
