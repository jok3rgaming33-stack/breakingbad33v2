"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { useCart } from "@/components/cart-provider"
import Image from "next/image"
import { FlaskConical, Sparkles, X as CloseIcon } from "lucide-react"
import { ProductBadges } from "@/components/product-badge"
import { resolveBadges } from "@/lib/badges"
import { getProductsBySection, decrementStock } from "@/app/actions/products"
import { requestRestockAlert, hasRestockAlert } from "@/app/actions/restock"
import { BellRing, BellPlus } from "lucide-react"
import type { Product, ProductVariant } from "@/lib/db/schema"

type SectionConfig = {
  section: string
  icon: "flask" | "sparkles"
  eyebrow: string
  title: string
  gridCols: string
  imageSize: string
  anchor?: string
}

// Prix effectif d'une variante après remise produit éventuelle.
function effectivePrice(price: number, product: Product): number {
  if (product.discountType === "percent" && product.discountValue) {
    return Math.max(0, Math.round(price * (1 - product.discountValue / 100)))
  }
  if (product.discountType === "fixed" && product.discountValue) {
    return Math.max(0, price - product.discountValue)
  }
  return price
}

export function ProductSection({ config }: { config: SectionConfig }) {
  const { addToCart } = useCart()
  const { data: products, mutate } = useSWR(`products:${config.section}`, () => getProductsBySection(config.section), {
    revalidateOnFocus: false,
  })

  const [selected, setSelected] = useState<Product | null>(null)
  const [variantIdx, setVariantIdx] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  // Produits pour lesquels le client a activé une alerte de disponibilité.
  const [alerted, setAlerted] = useState<Record<number, boolean>>({})
  const [alerting, setAlerting] = useState<number | null>(null)

  const requestAlert = async (product: Product) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) return
    setAlerting(product.id)
    const existing = await hasRestockAlert(product.id, token)
    if (!existing) {
      await requestRestockAlert(product.id, token)
    }
    setAlerted((prev) => ({ ...prev, [product.id]: true }))
    setAlerting(null)
  }

  const openModal = (product: Product) => {
    setSelected(product)
    setVariantIdx(0)
    setIsModalOpen(true)
    setIsAnimating(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setTimeout(() => {
      setSelected(null)
      setIsAnimating(false)
    }, 300)
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isModalOpen && isAnimating) {
      timer = setTimeout(() => setIsAnimating(false), 4000)
    }
    return () => clearTimeout(timer)
  }, [isModalOpen, isAnimating])

  const Icon = config.icon === "flask" ? FlaskConical : Sparkles
  const sectionProps = config.anchor
    ? { id: config.anchor, className: "mx-auto max-w-[1200px] px-4 pb-20 pt-10 scroll-mt-20" }
    : { className: "mx-auto max-w-[1200px] px-4 py-20" }

  const handleAdd = async () => {
    if (!selected) return
    const v = selected.variants[variantIdx]
    if (!v) return
    const price = effectivePrice(v.price, selected)
    addToCart(`${selected.title} ×${v.qty}`, price)
    // Décrémente le stock en base et rafraîchit l'affichage (temps réel).
    await decrementStock(selected.id, 1)
    mutate()
    closeModal()
  }

  return (
    <>
      <section {...sectionProps}>
        <div className="mb-12 flex items-center gap-4">
          <Icon className="h-8 w-8 text-[#3e6757]" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#3e6757]">{config.eyebrow}</p>
            <h2 className="text-4xl font-light tracking-tight text-white">{config.title}</h2>
          </div>
        </div>

        {!products ? (
          <div className={`grid gap-6 ${config.gridCols}`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl border border-white/10 bg-[#0a0a0a]" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Aucun produit dans cette section pour le moment.</p>
        ) : (
          <div className={`grid gap-6 ${config.gridCols}`}>
            {products.map((product) => {
              const badges = resolveBadges(product.badges, product.stock)
              const out = product.stock <= 0
              const minPrice = product.variants.length
                ? Math.min(...product.variants.map((v) => effectivePrice(v.price, product)))
                : 0
              return (
                <div
                  key={product.id}
                  onClick={() => !out && openModal(product)}
                  className={`group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 text-center transition-all ${
                    out ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#3e6757]/50"
                  }`}
                >
                  <ProductBadges badges={badges} />
                  <div className={`relative mb-6 ${config.imageSize}`}>
                    {product.image ? (
                      <Image src={product.image || "/placeholder.svg"} alt={product.title} fill className="object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
                        <FlaskConical className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  {product.symbol && (
                    <span className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">{product.symbol}</span>
                  )}
                  <h3 className="mb-2 text-lg font-semibold text-white">{product.title}</h3>
                  <p className="mb-3 text-xs text-zinc-500">
                    {out ? "Rupture de stock" : `Dès ${minPrice}€ · stock ${product.stock}`}
                  </p>
                  {out ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!alerted[product.id]) requestAlert(product)
                      }}
                      disabled={alerting === product.id || alerted[product.id]}
                      className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[#3e6757]/60 bg-[#3e6757]/10 py-2 text-xs font-medium text-[#7fae9b] transition-colors hover:bg-[#3e6757]/20 disabled:opacity-70"
                    >
                      {alerted[product.id] ? (
                        <>
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                          Alerte activée
                        </>
                      ) : (
                        <>
                          <BellPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          {alerting === product.id ? "…" : "Alerte dispo"}
                        </>
                      )}
                    </button>
                  ) : (
                    <button className="w-full rounded-full border border-white/10 py-2 text-xs text-white transition-colors hover:bg-white hover:text-black">
                      Détails
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {isModalOpen && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-all duration-1000 ${
                isAnimating ? "z-10 opacity-100" : "z-0 opacity-10"
              }`}
            >
              <video
                src="/images/CSS Smoke Effect/CSS Smoke Effect/smoke.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover mix-blend-screen"
              />
            </div>

            <button onClick={closeModal} className="absolute right-6 top-6 z-50 text-white/50 hover:text-white">
              <CloseIcon className="h-6 w-6" />
            </button>

            <div className="relative z-20 flex w-full items-center justify-center bg-[#050505]/50 p-12 md:w-1/2">
              <div className="relative h-64 w-64">
                {selected.image && (
                  <Image src={selected.image || "/placeholder.svg"} alt={selected.title} fill className="object-contain" />
                )}
              </div>
            </div>

            <div className="relative z-20 flex w-full flex-col justify-center p-12 md:w-1/2">
              {selected.number && (
                <span className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">
                  Code {selected.number}
                </span>
              )}
              <h3 className="mb-4 text-4xl font-bold text-white">{selected.title}</h3>
              <p className="mb-6 leading-relaxed text-zinc-400">{selected.fullDescription || selected.description}</p>

              <label
                htmlFor="variant-select"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-[#3e6757]"
              >
                Quantité
              </label>
              <select
                id="variant-select"
                value={variantIdx}
                onChange={(e) => setVariantIdx(Number(e.target.value))}
                className="mb-6 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#3e6757]"
              >
                {selected.variants.map((v: ProductVariant, i: number) => (
                  <option key={`${v.qty}-${i}`} value={i}>
                    {v.qty} — {effectivePrice(v.price, selected)}€
                    {effectivePrice(v.price, selected) !== v.price ? ` (au lieu de ${v.price}€)` : ""}
                  </option>
                ))}
              </select>

              <div className="mb-6 text-2xl font-semibold text-white">
                {selected.variants[variantIdx] ? effectivePrice(selected.variants[variantIdx].price, selected) : 0}€
              </div>

              <button
                onClick={handleAdd}
                className="w-full rounded-full bg-[#3e6757] py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-[#3e6757]/80"
              >
                Ajouter au Laboratoire
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
