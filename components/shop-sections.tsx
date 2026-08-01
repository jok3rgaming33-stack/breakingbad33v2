"use client"

import useSWR from "swr"
import { ProductSection } from "@/components/product-section"
import { ProductIndexNav } from "@/components/product-index-nav"
import { listCategories } from "@/app/actions/categories"

/**
 * Shell boutique BB33 :
 * - Catalogue centré
 * - xl+ : index produits sticky à droite (1 clic)
 * - Mobile : FAB + tiroir catalogue
 */
export function ShopSections() {
  const { data: categories } = useSWR("shop-categories", () => listCategories(), {
    revalidateOnFocus: false,
  })

  if (!categories) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-white/10 bg-[#0a0a0a]" />
          ))}
        </div>
      </div>
    )
  }

  const sections = categories.map((cat, idx) => (
    <ProductSection
      key={cat.id}
      config={{
        section: cat.key,
        icon: idx === 0 ? "flask" : "sparkles",
        eyebrow: idx === 0 ? "Laboratoire Clandestin" : "Sélection",
        title: cat.name,
        gridCols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4",
        imageSize: "aspect-square",
        anchor: idx === 0 ? "featured" : undefined,
      }}
    />
  ))

  return (
    <div className="relative w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,980px)_minmax(0,1fr)]">
        <div className="hidden xl:block" aria-hidden="true" />

        <div className="min-w-0 w-full px-3 sm:px-5 xl:px-3">{sections}</div>

        <div className="relative hidden min-w-0 xl:block">
          <div className="sticky top-24 max-w-[12rem] pl-2 pr-3 2xl:max-w-[13.5rem] 2xl:pl-3">
            <ProductIndexNav mode="rail" />
          </div>
        </div>
      </div>

      <ProductIndexNav mode="mobile" />
    </div>
  )
}
