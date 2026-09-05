"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { useCart } from "@/components/cart-provider"
import { FlaskConical, Sparkles, X as CloseIcon, BellRing, BellPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { sortProductsFeaturedFirst } from "@/lib/badges"
import { BlobMedia } from "@/components/blob-media"
import { ProductOrbitCarousel } from "@/components/product-orbit-carousel"
import { RatingBadge } from "@/components/product-rating-badge"
import { getProductsBySection, decrementStock } from "@/app/actions/products"
import { requestRestockAlert, hasRestockAlert } from "@/app/actions/restock"
import { reserveProduct, getMyReservation } from "@/app/actions/product-reservations"
import { getCustomerStats } from "@/app/actions/account"
import { getProductRatingSummaries, type ProductRatingSummary } from "@/app/actions/ratings"
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
  const [mediaIdx, setMediaIdx] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [alerted, setAlerted] = useState<Record<number, boolean>>({})
  const [alerting, setAlerting] = useState<number | null>(null)
  const [canReserve, setCanReserve] = useState(false)
  const [reserveBusy, setReserveBusy] = useState(false)
  const [reserveMsg, setReserveMsg] = useState<string | null>(null)
  const [reservedUntil, setReservedUntil] = useState<string | null>(null)
  const [ratings, setRatings] = useState<Record<number, ProductRatingSummary>>({})

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) {
      setCanReserve(false)
      return
    }
    getCustomerStats(token)
      .then((s) => setCanReserve(!!s.canReserve))
      .catch(() => setCanReserve(false))
  }, [])

  useEffect(() => {
    if (!selected || !canReserve) {
      setReservedUntil(null)
      setReserveMsg(null)
      return
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) return
    getMyReservation(selected.id, token)
      .then((r) => {
        if (r?.expiresAt) setReservedUntil(new Date(r.expiresAt).toISOString())
        else setReservedUntil(null)
      })
      .catch(() => setReservedUntil(null))
  }, [selected, canReserve])
  const requestAlert = async (product: Product) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) return
    setAlerting(product.id)
    try {
      const existing = await hasRestockAlert(product.id, token)
      if (!existing) {
        await requestRestockAlert(product.id, token)
      }
      setAlerted((prev) => ({ ...prev, [product.id]: true }))
    } finally {
      setAlerting(null)
    }
  }

  const openModal = (product: Product, startVariant = 0) => {
    setSelected(product)
    setVariantIdx(startVariant)
    setMediaIdx(0)
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

  useEffect(() => {
    if (!products?.length) return
    void getProductRatingSummaries(products.map((p) => p.id)).then(setRatings)
  }, [products])

  const Icon = config.icon === "flask" ? FlaskConical : Sparkles
  const isFirst = config.anchor === "featured"
  const sectionProps = config.anchor
    ? {
        id: config.anchor,
        className: isFirst
          ? "w-full overflow-hidden scroll-mt-20 pb-8 pt-2 sm:pb-10 sm:pt-3"
          : "w-full overflow-hidden scroll-mt-20 pb-8 pt-4 sm:pb-10 sm:pt-6",
      }
    : { className: "w-full overflow-hidden py-6 sm:py-8" }

  const ordered = products ? sortProductsFeaturedFirst(products) : null

  const handleAdd = async () => {
    if (!selected) return
    const v = selected.variants[variantIdx]
    if (!v) return
    const price = effectivePrice(v.price, selected)
    addToCart(`${selected.title} ×${v.qty}`, price, selected.id)
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
          <div className="mx-auto h-[300px] max-w-lg animate-pulse rounded-3xl border border-white/10 bg-[#0a0a0a] sm:h-[380px]" />
        ) : (
          <ProductOrbitCarousel
            products={ordered}
            sectionKey={config.section}
            ratings={ratings}
            onOpen={(product, variantIdx = 0) => {
              const avail = availableVariants(product)
              const idx =
                avail.find((a) => a.idx === variantIdx)?.idx ?? avail[0]?.idx ?? variantIdx
              openModal(product, idx)
            }}
          />
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

            <div className="relative z-20 flex w-full flex-col items-center justify-center gap-3 bg-[#050505]/50 p-6 md:w-1/2 md:p-12">
              {(() => {
                // Galerie : tous les médias + image principale si absente de media.
                const gallery: { url: string; type?: "image" | "video" }[] = []
                const seen = new Set<string>()
                const pushUrl = (url: string | null | undefined, type?: "image" | "video") => {
                  if (!url || seen.has(url)) return
                  seen.add(url)
                  gallery.push({ url, type: type ?? getMediaType(url, selected.media) })
                }
                for (const m of selected.media ?? []) pushUrl(m.url, m.type)
                pushUrl(selected.image)
                if (gallery.length === 0) return (
                  <div className="flex h-40 w-40 items-center justify-center text-zinc-700 md:h-64 md:w-64">
                    <FlaskConical className="h-12 w-12" />
                  </div>
                )
                const idx = Math.min(mediaIdx, gallery.length - 1)
                const current = gallery[idx]
                return (
                  <>
                    <div className="relative flex h-40 w-full max-w-xs items-center justify-center md:h-64">
                      <BlobMedia
                        src={current.url}
                        alt={selected.title}
                        mediaType={current.type}
                        className="max-h-full max-w-full object-contain"
                        videoProps={{
                          controls: true,
                          muted: true,
                          playsInline: true,
                          preload: "metadata",
                          style: { maxHeight: "100%", maxWidth: "100%", objectFit: "contain" },
                        }}
                      />
                      {gallery.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMediaIdx((i) => (i - 1 + gallery.length) % gallery.length)}
                            className="absolute left-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                            aria-label="Média précédent"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaIdx((i) => (i + 1) % gallery.length)}
                            className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                            aria-label="Média suivant"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                    {gallery.length > 1 && (
                      <div className="flex max-w-xs flex-wrap justify-center gap-1.5">
                        {gallery.map((g, i) => (
                          <button
                            key={g.url}
                            type="button"
                            onClick={() => setMediaIdx(i)}
                            className={`h-10 w-10 overflow-hidden rounded-lg border transition-colors ${
                              i === idx ? "border-accent" : "border-white/10 opacity-70 hover:opacity-100"
                            }`}
                            aria-label={`Voir média ${i + 1}`}
                          >
                            <BlobMedia
                              src={g.url}
                              alt=""
                              mediaType={g.type}
                              className="h-full w-full object-cover"
                              videoProps={{
                                muted: true,
                                playsInline: true,
                                preload: "metadata",
                                style: { height: "100%", width: "100%", objectFit: "cover" },
                              }}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="relative z-20 flex w-full flex-col justify-center overflow-y-auto p-8 pb-safe md:w-1/2 md:p-12">
              {selected.number && (
                <span className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">
                  Code {selected.number}
                </span>
              )}
              <h3 className="mb-4 text-3xl font-bold text-white sm:text-4xl">{selected.title}</h3>
              {ratings[selected.id] && (
                <div className="mb-4">
                  <RatingBadge summary={ratings[selected.id]} productTitle={selected.title} />
                </div>
              )}
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
                {selected.stock <= 0
                  ? "Rupture de stock"
                  : `${
                      selected.variants[variantIdx]
                        ? effectivePrice(selected.variants[variantIdx].price, selected)
                        : 0
                    }€`}
              </div>

              {selected.stock <= 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!alerted[selected.id]) void requestAlert(selected)
                  }}
                  disabled={alerting === selected.id || alerted[selected.id]}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-[#3e6757]/50 bg-[#3e6757]/10 py-4 text-sm font-bold uppercase tracking-widest text-[#7fae9b] disabled:opacity-70"
                >
                  {alerted[selected.id] ? (
                    <>
                      <BellRing className="h-4 w-4" aria-hidden="true" />
                      Alerte activée
                    </>
                  ) : (
                    <>
                      <BellPlus className="h-4 w-4" aria-hidden="true" />
                      {alerting === selected.id ? "…" : "Me prévenir"}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleAdd}
                  className="w-full rounded-full bg-[#3e6757] py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-[#3e6757]/80"
                >
                  Ajouter au Laboratoire
                </button>
              )}

              {/* Réservation Platine : sécurise 1 unité 48 h */}
              {canReserve && selected.stock > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={reserveBusy || !!reservedUntil}
                    onClick={async () => {
                      const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
                      if (!token) {
                        setReserveMsg("Connecte-toi pour réserver.")
                        return
                      }
                      setReserveBusy(true)
                      setReserveMsg(null)
                      try {
                        const res = await reserveProduct(selected.id, token)
                        if (!res.ok) {
                          setReserveMsg(res.error)
                          return
                        }
                        const exp = res.expiresAt ? new Date(res.expiresAt) : null
                        setReservedUntil(exp?.toISOString() ?? null)
                        setReserveMsg(
                          res.already
                            ? "Déjà réservé pour toi."
                            : `💎 Réservé 48 h${exp ? ` jusqu’au ${exp.toLocaleString("fr-FR")}` : ""}.`,
                        )
                      } finally {
                        setReserveBusy(false)
                      }
                    }}
                    className="w-full rounded-full border border-cyan-400/40 bg-cyan-500/10 py-3 text-xs font-bold uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {reservedUntil
                      ? `💎 Réservé jusqu’au ${new Date(reservedUntil).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                      : reserveBusy
                        ? "Réservation…"
                        : "💎 Réserver (Platine · 48 h)"}
                  </button>
                  {reserveMsg && (
                    <p className="mt-1.5 text-center text-[11px] text-cyan-200/80">{reserveMsg}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
