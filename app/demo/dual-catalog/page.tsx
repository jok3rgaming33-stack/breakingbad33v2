import type { Metadata } from "next"
import { DualCatalogDemo } from "@/app/demo/_components/dual-catalog-demo"

export const metadata: Metadata = {
  title: "Concept — Laboratoire & Fumoir (démo)",
  description:
    "Prototype dual-catalogue : bascule animée entre Le Laboratoire et Le Fumoir.",
  robots: { index: false, follow: false },
}

export default function DualCatalogDemoPage() {
  return (
    <DualCatalogDemo
      backHref="/demo"
      backLabel="Retour démo"
      showBanner={false}
    />
  )
}
