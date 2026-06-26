"use client"

import { ProductSection } from "@/components/product-section"

// Section "Nouveautés" (arrivals) — désormais alimentée par la base de données.
export function NewArrivals() {
  return (
    <ProductSection
      config={{
        section: "arrival",
        icon: "sparkles",
        eyebrow: "Nouvel Arrivage",
        title: "Nouveautés",
        gridCols: "md:grid-cols-2 lg:grid-cols-5",
        imageSize: "h-32 w-32",
      }}
    />
  )
}
