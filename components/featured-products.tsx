"use client"

import { ProductSection } from "@/components/product-section"

// Section "Best-Seller" (vedette) — désormais alimentée par la base de données.
export function FeaturedProducts() {
  return (
    <ProductSection
      config={{
        section: "featured",
        icon: "flask",
        eyebrow: "Laboratoire Clandestin",
        title: "Nos Best-Seller",
        gridCols: "md:grid-cols-2 lg:grid-cols-4",
        imageSize: "h-40 w-40",
      }}
    />
  )
}
