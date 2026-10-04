/** Affiche une quantité en grammes : 0.5 → « 0,5g », 2 → « 2g ». */
export function formatVariantQty(qty: number): string {
  const n = Number(qty)
  if (!Number.isFinite(n)) return ""
  const rounded = Math.round(n * 10) / 10
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${label}g`
}
