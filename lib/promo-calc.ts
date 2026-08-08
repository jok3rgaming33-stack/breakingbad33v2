/** Calcul de remise promo — partagé panier client / création commande admin. */

export type PromoCalcInput = {
  type: "percent" | "fixed" | "produit"
  value: number
  minAmount: number
  productName?: string | null
}

export type PromoCalcItem = {
  title: string
  qty: number
  price: number
}

/** Calcule la remise promo (€) — mêmes règles que le panier client. */
export function computePromoDiscount(
  items: PromoCalcItem[],
  subtotal: number,
  promo: PromoCalcInput | null | undefined,
): number {
  if (!promo) return 0
  const minAmount = Math.max(0, Math.trunc(Number(promo.minAmount) || 0))
  if (subtotal < minAmount) return 0
  const value = Math.max(0, Number(promo.value) || 0)
  if (promo.type === "produit") {
    const name = (promo.productName ?? "").trim().toLowerCase()
    if (!name) return 0
    const target = items.find((i) => i.title.toLowerCase() === name)
    if (!target) return 0
    const freeQty = Math.min(Math.trunc(value), target.qty)
    return Math.min(target.price * freeQty, subtotal)
  }
  const raw =
    promo.type === "percent" ? Math.round((subtotal * value) / 100) : Math.trunc(value)
  return Math.min(Math.max(0, raw), subtotal)
}
