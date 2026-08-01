"use client"

import { useState, useEffect, type MouseEvent } from "react"
import useSWR from "swr"
import { useCart } from "@/components/cart-provider"
import { FlaskConical, Sparkles, X as CloseIcon, BellRing, BellPlus } from "lucide-react"
import { ProductBadges } from "@/components/product-badge"
import {
  resolveBadges,
  isFeaturedProduct,
  sortProductsFeaturedFirst,
} from "@/lib/badges"
import { BlobMedia } from "@/components/blob-media"
import { getProductsBySection, decrementStock } from "@/app/actions/products"
import { requestRestockAlert, hasRestockAlert } from "@/app/actions/restock"
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

function getMediaType(
  url: string | null | undefined,
  media: Array<{ url: string; type: "image" | "video" }> | null | undefined,
): "image" | "video" | undefined {
  if (!url || !media?.length) return undefined
  const normalize = (u: string) => {
    if (u.startsWith("/api/media?")) {
      try {
        return new URLSearchParams(u.slice(u.indexOf("?"))).get("url") ?? u
      } catch {
        return u
      }
    }
    return u
  }
  const rawUrl = normalize(url)
  const match = media.find((m) => normalize(m.url) === rawUrl || m.url === url)
  return match?.type
}

function effectivePrice(price: number, product: Product): number {
  if (product.discountType === "percent" && product.discountValue) {
    return Math.max(0, Math.round(price * (1 - product.discountValue / 100)))
  }
  if (product.discountType === "fixed" && product.discountValue) {
    return Math.max(0, price - product.discountValue)
  }
  return price
}

/** Variantes couvertes par le stock actuel. */
function availableVariants(product: Product): { v: ProductVariant; idx: number }[] {
  return product.variants
    .map((v, idx) => ({ v, idx }))
    .filter(({ v }) => v.qty <= product.stock)
}

export function ProductSection({ config }: { config: SectionConfig }) {
  const { addToCart } = useCart()
  const { data: products, mutate } = useSWR(
    `products:${config.section}`,
    () => getProductsBySection(config.section),
    { revalidateOnFocus: false },
  )

  const [selected, setSelected] = useState<Product | null>(null)
  const [variantIdx, setVariantIdx] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
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

  const openModal = (product: Product, startVariant = 0) => {
    setSelected(product)
    setVariantIdx(startVariant)
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
    ? { id: config.anchor, className: "w-full pb-12 pt-8 scroll-mt-20" }
    : { className: "w-full py-10 sm:py-12" }

  const ordered = products ? sortProductsFeaturedFirst(products) : null

  const handleAdd = async () => {
    if (!selected) return
    const v = selected.variants[variantIdx]
    if (!v) return
    const price = effectivePrice(v.price, selected)
    addToCart(`${selected.title} ×${v.qty}`, price)
    await decrementStock(selected.id, 1)
    mutate()
    closeModal()
  }

  return (
    <>
      <section {...sectionProps}>
        <div className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
          <Icon className="h-6 w-6 shrink-0 text-[#3e6757] sm:h-7 sm:w-7" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#3e6757] sm:text-xs sm:tracking-[0.3em]">
              {config.eyebrow}
            </p>
            <h2 className="truncate text-2xl font-light tracking-tight text-white sm:text-3xl">
              {config.title}
            </h2>
          </div>
        </div>

        {!ordered ? (
          <div className={`grid gap-3 sm:gap-4 ${config.gridCols}`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl border border-white/10 bg-[#0a0a0a]"
              />
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Aucun produit dans cette section pour le moment.
          </p>
        ) : (
          <div className={`grid gap-3 sm:gap-4 ${config.gridCols}`}>
            {ordered.map((product) => {
              const badges = resolveBadges(product.badges, product.stock)
              const featured = isFeaturedProduct(product.badges)
              const out = product.stock <= 0
              const avail = availableVariants(product)
              const minPrice = avail.length
                ? Math.min(...avail.map(({ v }) => effectivePrice(v.price, product)))
                : product.variants.length
                  ? Math.min(
                      ...product.variants.map((v) => effectivePrice(v.price, product)),
                    )
                  : 0
              const mainUrl = product.image || product.media?.[0]?.url || null
              const mainType = mainUrl
                ? (getMediaType(mainUrl, product.media) ??
                  product.media?.find((m) => m.url === mainUrl)?.type)
                : undefined

              return (
                <article
                  key={product.id}
                  id={`product-${product.id}`}
                  data-product-id={product.id}
                  onClick={() => !out && openModal(product, avail[0]?.idx ?? 0)}
                  className={`group relative flex scroll-mt-28 flex-col overflow-hidden rounded-2xl border transition-all ${
                    out
                      ? "cursor-not-allowed border-white/5 bg-[#0a0a0a] opacity-50"
                      : featured
                        ? "product-featured-arrivage cursor-pointer border-sky-400/40 bg-[#0a0a0a] hover:border-sky-400/70"
                        : "cursor-pointer border-white/10 bg-[#0a0a0a] hover:border-[#3e6757]/50"
                  }`}
                >
                  {/* Miniature compacte */}
                  <div className="relative aspect-square w-full overflow-hidden bg-[#111]">
                    {mainUrl ? (
                      <BlobMedia
                        src={mainUrl}
                        alt={product.title}
                        mediaType={mainType}
                        className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-700">
                        <FlaskConical className="h-10 w-10" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                    <ProductBadges badges={badges} />
                    {featured && !out && (
                      <span className="absolute left-2 top-2 z-20 rounded-full bg-sky-400/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black badge-blink">
                        À la une
                      </span>
                    )}
                  </div>

                  {/* Infos condensées + variantes */}
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                      {product.title}
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      {out ? "Rupture" : `Dès ${minPrice}€`}
                      {!out && product.stock <= 5 ? ` · stock ${product.stock}` : ""}
                    </p>

                    {/* Variantes visibles sur la carte */}
                    {!out && avail.length > 0 && (
                      <div
                        className="mt-0.5 flex flex-wrap gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {avail.slice(0, 4).map(({ v, idx }) => {
                          const price = effectivePrice(v.price, product)
                          return (
                            <button
                              key={`${product.id}-v-${idx}`}
                              type="button"
                              onClick={(e: MouseEvent) => {
                                e.stopPropagation()
                                openModal(product, idx)
                              }}
                              className="rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-300 transition-colors hover:border-[#3e6757]/60 hover:bg-[#3e6757]/15 hover:text-white"
                              title={`×${v.qty} — ${price}€`}
                            >
                              ×{v.qty}
                              <span className="ml-0.5 text-zinc-500">{price}€</span>
                            </button>
                          )
                        })}
                        {avail.length > 4 && (
                          <span className="self-center px-1 text-[10px] text-zinc-600">
                            +{avail.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {out ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!alerted[product.id]) requestAlert(product)
                        }}
                        disabled={alerting === product.id || alerted[product.id]}
                        className="mt-auto flex w-full items-center justify-center gap-1 rounded-full border border-[#3e6757]/50 bg-[#3e6757]/10 py-1.5 text-[11px] font-medium text-[#7fae9b] disabled:opacity-70"
                      >
                        {alerted[product.id] ? (
                          <>
                            <BellRing className="h-3 w-3" aria-hidden="true" />
                            Alerte OK
                          </>
                        ) : (
                          <>
                            <BellPlus className="h-3 w-3" aria-hidden="true" />
                            {alerting === product.id ? "…" : "Alerte"}
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mt-auto w-full rounded-full border border-white/10 py-1.5 text-[11px] text-zinc-300 transition-colors group-hover:border-[#3e6757]/40 group-hover:text-white"
                      >
                        Choisir
                      </button>
                    )}
                  </div>
                </article>
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
            className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] md:flex-row"
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

            <button
              onClick={closeModal}
              className="absolute right-6 top-6 z-50 text-white/50 hover:text-white"
            >
              <CloseIcon className="h-6 w-6" />
            </button>

            <div className="relative z-20 flex w-full items-center justify-center bg-[#050505]/50 p-6 md:w-1/2 md:p-12">
              <div className="relative h-40 w-40 md:h-64 md:w-64">
                {selected.image && (
                  <BlobMedia
                    src={selected.image}
                    alt={selected.title}
                    mediaType={getMediaType(selected.image, selected.media)}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            </div>

            <div className="relative z-20 flex w-full flex-col justify-center overflow-y-auto p-8 pb-safe md:w-1/2 md:p-12">
              {selected.number && (
                <span className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">
                  Code {selected.number}
                </span>
              )}
              <h3 className="mb-4 text-3xl font-bold text-white sm:text-4xl">{selected.title}</h3>
              <p className="mb-6 leading-relaxed text-zinc-400">
                {selected.fullDescription || selected.description}
              </p>

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
                {selected.variants.map((v: ProductVariant, i: number) => {
                  if (v.qty > selected.stock) return null
                  return (
                    <option key={`${v.qty}-${i}`} value={i}>
                      {v.qty} — {effectivePrice(v.price, selected)}€
                      {effectivePrice(v.price, selected) !== v.price
                        ? ` (au lieu de ${v.price}€)`
                        : ""}
                    </option>
                  )
                })}
              </select>

              <div className="mb-6 text-2xl font-semibold text-white">
                {selected.variants[variantIdx]
                  ? effectivePrice(selected.variants[variantIdx].price, selected)
                  : 0}
                €
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
