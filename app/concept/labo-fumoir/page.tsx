import type { Metadata } from "next"
import { DualCatalogDemo } from "@/app/demo/_components/dual-catalog-demo"

export const metadata: Metadata = {
  title: "Concept — Laboratoire & Fumoir",
  description:
    "Prototype dual-catalogue : bascule animée entre Le Laboratoire et Le Fumoir. Hors boutique live.",
  robots: { index: false, follow: false },
}

/**
 * Route publique (sans mot de passe démo) pour tester le concept dual-catalogue.
 * N'affecte pas la boutique principale.
 */
export default function LaboFumoirConceptPage() {
  return (
    <DualCatalogDemo
      backHref="/"
      backLabel="Boutique"
      showBanner
    />
  )
}
