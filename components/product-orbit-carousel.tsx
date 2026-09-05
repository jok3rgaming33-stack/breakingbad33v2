"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { ChevronLeft, ChevronRight, FlaskConical, Pause, Play, Star } from "lucide-react"
import { BlobMedia } from "@/components/blob-media"
import { ProductBadges } from "@/components/product-badge"
import { RatingBadge } from "@/components/product-rating-badge"
import { resolveBadges, isFeaturedProduct } from "@/lib/badges"
import type { ProductRatingSummary } from "@/app/actions/ratings"
import type { Product } from "@/lib/db/schema"

export type OrbitProductOpen = (product: Product, variantIdx?: number) => void

type ProductOrbitCarouselProps = {
  products: Product[]
  onOpen: OrbitProductOpen
  /** Auto-spin deg/s (0 = off by default on reduced motion). */
  autoSpeed?: number
  className?: string
  /** Section key — pour les deep-links catalogue. */
  sectionKey?: string
  ratings?: Record<number, ProductRatingSummary>
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

function minPriceLabel(product: Product): string {
  if (product.stock <= 0) return "Rupture"
  if (!product.variants?.length) return "—"
  const prices = product.variants
    .filter((v) => v.qty <= product.stock)
    .map((v) => effectivePrice(v.price, product))
  const list = prices.length
    ? prices
    : product.variants.map((v) => effectivePrice(v.price, product))
  const min = Math.min(...list)
  return `dès ${min}€`
}

function computeLayout(width: number, n: number) {
  // Vignettes un peu plus grandes → badges lisibles sans se marcher dessus
  const cardW =
    width < 380 ? 136 : width < 480 ? 152 : width < 768 ? 172 : width < 1024 ? 192 : 210
  // Rayon : assez large pour éviter le chevauchement (surtout mobile)
  const angle = Math.PI / Math.max(n, 3)
  const minR = (cardW * 0.64) / Math.tan(angle)
  const rFromWidth = width * (width < 480 ? 0.38 : width < 768 ? 0.36 : 0.32)
  const radius = Math.round(Math.min(Math.max(minR, rFromWidth, 148), 400))
  const stageH = Math.round(
    Math.min(560, Math.max(310, cardW * 1.58 + (width < 480 ? 78 : 120))),
  )
  return { cardW, radius, stageH }
}

/**
 * Carousel 3D orbit (axe vertical) pour une section produits.
 * Mobile : drag horizontal, rayon/cartes adaptés, overflow clip, pause hors viewport.
 */
export function ProductOrbitCarousel({
  products,
  onOpen,
  autoSpeed = 10,
  className = "",
  sectionKey,
  ratings = {},
}: ProductOrbitCarouselProps) {
  const n = products.length
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [rotation, setRotation] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [active, setActive] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [inView, setInView] = useState(true)
  const [layout, setLayout] = useState({ cardW: 150, radius: 220, stageH: 360 })

  const dragRef = useRef<{
    x: number
    y: number
    rot: number
    axis: "h" | "v" | null
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const rotRef = useRef(0)
  const playingRef = useRef(playing)
  const inViewRef = useRef(inView)
  const frameRef = useRef<number | null>(null)
  const lastTs = useRef<number | null>(null)

  useEffect(() => {
    rotRef.current = rotation
  }, [rotation])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    inViewRef.current = inView
  }, [inView])

  // Layout responsive
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const sync = () => {
      const w = el.clientWidth || window.innerWidth
      setLayout(computeLayout(w, Math.max(n, 1)))
    }
    sync()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null
    ro?.observe(el)
    window.addEventListener("resize", sync)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", sync)
    }
  }, [n])

  // Reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    if (mq.matches) setPlaying(false)
    const onChange = () => {
      setReducedMotion(mq.matches)
      if (mq.matches) setPlaying(false)
    }
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])

  // Pause hors écran (perf : 3 carousels)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { rootMargin: "80px", threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const step = n > 0 ? 360 / n : 0

  const snapTo = useCallback(
    (index: number) => {
      if (n < 1) return
      const i = ((index % n) + n) % n
      const target = -i * step
      const curNorm = ((rotRef.current % 360) + 360) % 360
      let delta = target - curNorm
      delta = ((((delta + 180) % 360) + 360) % 360) - 180
      const next = rotRef.current + delta
      rotRef.current = next
      setRotation(next)
      setActive(i)
    },
    [n, step],
  )

  // Auto-spin
  useEffect(() => {
    if (reducedMotion || n < 2) return
    const tick = (ts: number) => {
      if (lastTs.current == null) lastTs.current = ts
      const dt = Math.min(0.05, (ts - lastTs.current) / 1000)
      lastTs.current = ts
      if (playingRef.current && inViewRef.current && !dragRef.current) {
        const next = rotRef.current + autoSpeed * dt
        rotRef.current = next
        setRotation(next)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      lastTs.current = null
    }
  }, [autoSpeed, n, reducedMotion])

  // Active index from rotation
  useEffect(() => {
    if (n < 1) return
    const norm = ((rotation % 360) + 360) % 360
    const idx = Math.round((-norm / step + n * 20) % n) % n
    setActive(idx)
  }, [rotation, n, step])

  // Deep-link catalogue → focus produit
  useEffect(() => {
    const onFocus = (ev: Event) => {
      const id = Number((ev as CustomEvent).detail?.id)
      if (!Number.isFinite(id)) return
      const idx = products.findIndex((p) => p.id === id)
      if (idx < 0) return
      setPlaying(false)
      snapTo(idx)
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    window.addEventListener("bb33:focus-product", onFocus as EventListener)
    return () => window.removeEventListener("bb33:focus-product", onFocus as EventListener)
  }, [products, snapTo])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (n < 2) return
    // Pas de setPointerCapture ici : sur desktop ça vole le click de la carte
    // (Safari mobile le laissait passer → « ça marche au tel, pas sur le web »).
    suppressClickRef.current = false
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      rot: rotRef.current,
      axis: null,
      moved: false,
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // Lock axis : évite de bloquer le scroll vertical page
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      d.axis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v"
      if (d.axis === "v") {
        dragRef.current = null
        setDragging(false)
        return
      }
      setDragging(true)
      setPlaying(false)
      try {
        stageRef.current?.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (d.axis !== "h") return
    if (Math.abs(dx) > 4) d.moved = true
    e.preventDefault()
    const next = d.rot + dx * 0.42
    rotRef.current = next
    setRotation(next)
  }

  const endDrag = (e?: ReactPointerEvent) => {
    if (!dragRef.current) return
    const wasH = dragRef.current.axis === "h"
    const moved = dragRef.current.moved
    dragRef.current = null
    setDragging(false)
    if (e) {
      try {
        stageRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (wasH && moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 280)
      if (n > 0) {
        const norm = ((rotRef.current % 360) + 360) % 360
        const idx = Math.round((-norm / step + n * 20) % n) % n
        snapTo(idx)
      }
    }
  }

  const go = (dir: -1 | 1) => {
    if (n < 2) return
    setPlaying(false)
    snapTo(active + dir)
  }

  if (n === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Aucun produit dans cette section pour le moment.
      </p>
    )
  }

  // ─── Cas 1 produit : carte centrée (pas d'orbite inutile) ───
  if (n === 1) {
    const product = products[0]!
    const out = product.stock <= 0
    const featured = isFeaturedProduct(product.badges)
    const badges = resolveBadges(product.badges, product.stock)
    const mainUrl = product.image || product.media?.[0]?.url || null
    const mainType = mainUrl
      ? (getMediaType(mainUrl, product.media) ??
        product.media?.find((m) => m.url === mainUrl)?.type)
      : undefined

    return (
      <div ref={rootRef} className={`relative w-full ${className}`} data-section={sectionKey}>
        <span id={`product-${product.id}`} className="sr-only" />
        <button
          type="button"
          disabled={out}
          onClick={() => !out && onOpen(product, 0)}
          className={`mx-auto flex w-full max-w-[220px] flex-col overflow-hidden rounded-3xl border bg-[#0a0a0a]/95 p-3 text-left shadow-2xl transition-colors ${
            out
              ? "cursor-not-allowed border-white/5 opacity-50"
              : featured
                ? "border-sky-400/40 hover:border-sky-400/70"
                : "border-[#3e6757]/50 hover:border-[#3e6757]/80"
          }`}
        >
          <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-2xl bg-[#111]">
            {mainUrl ? (
              <BlobMedia
                src={mainUrl}
                alt={product.title}
                mediaType={mainType}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-700">
                <FlaskConical className="h-10 w-10" />
              </div>
            )}
            <ProductBadges badges={badges} compact max={2} />
          </div>
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-[#3e6757]">
            {minPriceLabel(product)}
          </p>
          <h3 className="line-clamp-2 text-sm font-semibold text-white">{product.title}</h3>
        </button>
      </div>
    )
  }

  const { cardW, radius, stageH } = layout

  return (
    <div
      ref={rootRef}
      className={`relative w-full select-none ${className}`}
      data-section={sectionKey}
    >
      {/* Ancres invisibles pour scroll / index catalogue */}
      {products.map((p) => (
        <span key={`anchor-${p.id}`} id={`product-${p.id}`} className="sr-only" />
      ))}

      {/* Clip HORSde la perspective : overflow+preserve-3d sur le même nœud
          laisse les cartes 3D peindre par-dessus toute la page (site cassé). */}
      <div
        className="relative mx-auto w-full overflow-hidden"
        style={{
          height: stageH,
          clipPath: "inset(0)",
          WebkitClipPath: "inset(0)",
          isolation: "isolate",
          contain: "paint",
        }}
      >
      <div
        ref={stageRef}
        className="absolute inset-0 touch-pan-y"
        style={{
          perspective: "900px",
          perspectiveOrigin: "50% 45%",
          WebkitPerspective: "900px",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="region"
        aria-roledescription="carousel"
        aria-label="Carousel produits"
      >
        {/* Glow sol */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] bottom-[6%] h-16 rounded-[100%] bg-[#3e6757]/20 blur-2xl sm:h-24 sm:blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[40%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3e6757]/12 blur-3xl"
        />

        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transform: `translateZ(-${Math.round(radius * 0.08)}px) rotateX(3deg) rotateY(${rotation}deg)`,
            transition: dragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {products.map((product, i) => {
            const angle = i * step
            const isFront = i === active
            const out = product.stock <= 0
            const featured = isFeaturedProduct(product.badges)
            const badges = resolveBadges(product.badges, product.stock)
            const mainUrl = product.image || product.media?.[0]?.url || null
            const mainType = mainUrl
              ? (getMediaType(mainUrl, product.media) ??
                product.media?.find((m) => m.url === mainUrl)?.type)
              : undefined

            return (
              <div
                key={product.id}
                data-orbit-card
                data-product-id={product.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-left"
                style={{
                  width: cardW,
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  zIndex: isFront ? 5 : 1,
                  pointerEvents: "none",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
                aria-hidden
              >
                <div
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[#0a0a0a]/95 p-2 shadow-xl backdrop-blur-md transition-[box-shadow,border-color,opacity] duration-300 sm:rounded-3xl sm:p-2.5 ${
                    out
                      ? "border-white/5 opacity-45"
                      : isFront
                        ? featured
                          ? "border-sky-400/60 opacity-100 shadow-[0_0_36px_rgba(56,189,248,0.35)]"
                          : "border-[#3e6757]/65 opacity-100 shadow-[0_0_36px_rgba(62,103,87,0.4)]"
                        : "border-white/10 opacity-70"
                  }`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "translateZ(0)",
                  }}
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#111] sm:rounded-2xl">
                    {mainUrl ? (
                      <BlobMedia
                        src={mainUrl}
                        alt=""
                        mediaType={mainType}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-700">
                        <FlaskConical className="h-8 w-8" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                    {/* Badges uniquement à droite (évite double « À la une » / Arrivage) */}
                    <ProductBadges badges={badges} compact max={2} />
                    {ratings[product.id] && (
                      <span
                        className="pointer-events-none absolute bottom-1 left-1 z-20 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-0.5 ring-1 ring-amber-400/30"
                        aria-label={`Note ${ratings[product.id].avgScore}/5`}
                      >
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                        <span className="font-mono text-[9px] font-bold tabular-nums leading-none text-amber-300">
                          {ratings[product.id].avgScore.toFixed(1)}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 min-w-0 px-0.5 pb-0.5">
                    <p className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-[#3e6757] sm:text-[10px]">
                      {minPriceLabel(product)}
                    </p>
                    <h3 className="line-clamp-2 text-[11px] font-semibold leading-snug text-white sm:text-xs">
                      {product.title}
                    </h3>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Cible 2D (hors preserve-3d) : clic desktop fiable sur la carte de face. */}
        <button
          type="button"
          data-orbit-hit
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-[46%] cursor-pointer rounded-3xl bg-transparent"
          style={{ width: cardW, height: Math.round(cardW * 1.38) }}
          aria-label={
            products[active]
              ? `Ouvrir ${products[active]!.title}`
              : "Ouvrir le produit"
          }
          onClick={(e) => {
            e.stopPropagation()
            if (suppressClickRef.current) return
            const product = products[active]
            if (!product) return
            onOpen(product, 0)
          }}
        />
      </div>
      </div>

      {/* Contrôles */}
      <div className="mt-1 flex flex-col items-center gap-2.5 px-1 sm:mt-2 sm:gap-3">
        <div className="flex max-w-md flex-col items-center gap-1.5 px-2 text-center">
          <p className="text-xs text-zinc-400 sm:text-sm">
            <span className="font-semibold text-white">{products[active]?.title}</span>
            <span className="text-zinc-500"> · {minPriceLabel(products[active]!)}</span>
          </p>
          {products[active] && ratings[products[active].id] && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <RatingBadge
                summary={ratings[products[active].id]}
                productTitle={products[active].title}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
            aria-label="Produit précédent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={reducedMotion}
            className="flex h-10 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-full border border-[#3e6757]/40 bg-[#3e6757]/15 px-3 text-xs font-semibold text-[#9ec5b4] hover:bg-[#3e6757]/25 disabled:opacity-40"
            aria-label={playing ? "Pause" : "Lecture"}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Lecture"}
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
            aria-label="Produit suivant"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex max-w-full flex-wrap justify-center gap-1.5" role="tablist">
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => {
                setPlaying(false)
                snapTo(i)
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-5 bg-[#3e6757] sm:w-6" : "w-1.5 bg-white/25 hover:bg-white/40"
              }`}
              aria-label={p.title}
            />
          ))}
        </div>
        <p className="px-2 text-center text-[10px] leading-snug text-zinc-500 sm:text-zinc-600">
          Glisse · flèches · clique la carte face avant pour ouvrir
        </p>
      </div>
    </div>
  )
}
