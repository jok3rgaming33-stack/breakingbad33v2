"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

export type OrbitItem = {
  id: number | string
  title: string
  subtitle?: string
  priceLabel?: string
  image: string
  accent?: string
}

type DemoOrbitCarouselProps = {
  items: OrbitItem[]
  /** Rayon de l'orbite en px (desktop). */
  radius?: number
  /** Auto-rotation (deg/s). */
  autoSpeed?: number
  onSelect?: (item: OrbitItem) => void
  className?: string
}

/**
 * Carousel 3D type coverflow / orbite horizontale autour d'un axe vertical.
 * Inspiration : cartes flottantes qui tournent en boucle (sans table).
 */
export function DemoOrbitCarousel({
  items,
  radius = 320,
  autoSpeed = 12,
  onSelect,
  className = "",
}: DemoOrbitCarouselProps) {
  const n = items.length
  const [rotation, setRotation] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [active, setActive] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const dragRef = useRef<{ x: number; rot: number } | null>(null)
  const rotRef = useRef(0)
  const playingRef = useRef(playing)
  const frameRef = useRef<number | null>(null)
  const lastTs = useRef<number | null>(null)

  useEffect(() => {
    rotRef.current = rotation
  }, [rotation])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

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

  // Auto-spin
  useEffect(() => {
    if (reducedMotion || n < 2) return

    const tick = (ts: number) => {
      if (lastTs.current == null) lastTs.current = ts
      const dt = Math.min(0.05, (ts - lastTs.current) / 1000)
      lastTs.current = ts
      if (playingRef.current && !dragRef.current) {
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

  // Index face avant
  useEffect(() => {
    if (n < 1) return
    const step = 360 / n
    const norm = ((rotation % 360) + 360) % 360
    // Carte i est face caméra quand rotation ≈ -i * step
    const idx = Math.round((-norm / step + n * 10) % n) % n
    setActive(idx)
  }, [rotation, n])

  const step = n > 0 ? 360 / n : 0

  const clampRadius = useMemo(() => {
    if (typeof window === "undefined") return radius
    return Math.min(radius, Math.max(160, window.innerWidth * 0.38))
  }, [radius])

  const [r, setR] = useState(clampRadius)
  useEffect(() => {
    const sync = () => setR(Math.min(radius, Math.max(160, window.innerWidth * 0.38)))
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [radius])

  const snapTo = useCallback(
    (index: number) => {
      if (n < 1) return
      const target = -index * step
      // Plus court chemin depuis rotation actuelle
      let delta = target - (((rotRef.current % 360) + 360) % 360)
      // normalize delta to [-180, 180]
      delta = ((((delta + 180) % 360) + 360) % 360) - 180
      // Also account for full turns already accumulated
      const base = rotRef.current - ((((rotRef.current % 360) + 360) % 360))
      const next = base + (((rotRef.current % 360) + 360) % 360) + delta
      rotRef.current = next
      setRotation(next)
      setActive(index)
    },
    [n, step],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, rot: rotRef.current }
    setDragging(true)
    setPlaying(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const next = dragRef.current.rot + dx * 0.35
    rotRef.current = next
    setRotation(next)
  }

  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    // Snap to nearest
    if (n > 0) {
      const norm = ((rotRef.current % 360) + 360) % 360
      const idx = Math.round((-norm / step + n * 10) % n) % n
      snapTo(idx)
    }
  }

  const go = (dir: -1 | 1) => {
    setPlaying(false)
    snapTo((active + dir + n) % n)
  }

  if (n === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Aucun produit à afficher
      </div>
    )
  }

  return (
    <div className={`relative w-full select-none ${className}`}>
      {/* Stage */}
      <div
        className="relative mx-auto h-[380px] w-full max-w-5xl touch-pan-y sm:h-[440px] md:h-[500px]"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 45%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="region"
        aria-roledescription="carousel"
        aria-label="Carousel produits 3D"
      >
        {/* Soft floor glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[15%] bottom-[8%] h-24 rounded-[100%] bg-[#3e6757]/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3e6757]/15 blur-3xl"
        />

        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateZ(-${r * 0.15}px) rotateX(6deg) rotateY(${rotation}deg)`,
            transition: dragging ? "none" : "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {items.map((item, i) => {
            const angle = i * step
            const isFront = i === active
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isFront) onSelect?.(item)
                  else {
                    setPlaying(false)
                    snapTo(i)
                  }
                }}
                className="absolute left-1/2 top-1/2 w-[150px] -translate-x-1/2 -translate-y-1/2 outline-none sm:w-[170px] md:w-[190px]"
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${r}px)`,
                  transformStyle: "preserve-3d",
                  zIndex: isFront ? 20 : 1,
                }}
                aria-current={isFront ? "true" : undefined}
                aria-label={item.title}
              >
                <div
                  className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-[#0a0a0a]/90 p-3 shadow-2xl backdrop-blur-md transition-[box-shadow,border-color,opacity] duration-300 ${
                    isFront
                      ? "border-[#3e6757]/70 shadow-[0_0_40px_rgba(62,103,87,0.45)] opacity-100"
                      : "border-white/10 opacity-75 hover:opacity-90"
                  }`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-2xl bg-[#050505]">
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                      sizes="190px"
                      draggable={false}
                    />
                    {isFront && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#3e6757]/25 via-transparent to-transparent"
                      />
                    )}
                  </div>
                  <div className="px-1 pb-1 text-left">
                    <p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-[#3e6757]">
                      {item.subtitle || "Sélection"}
                    </p>
                    <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
                    {item.priceLabel && (
                      <p className="mt-0.5 text-xs text-zinc-400">{item.priceLabel}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-2 flex flex-col items-center gap-3">
        <p className="max-w-md text-center text-sm text-zinc-400">
          <span className="font-semibold text-white">{items[active]?.title}</span>
          {items[active]?.priceLabel ? (
            <span className="text-zinc-500"> · {items[active]?.priceLabel}</span>
          ) : null}
        </p>
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
            className="flex h-10 items-center gap-2 rounded-full border border-[#3e6757]/40 bg-[#3e6757]/15 px-4 text-xs font-semibold text-[#9ec5b4] hover:bg-[#3e6757]/25 disabled:opacity-40"
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
        <div className="flex gap-1.5" role="tablist" aria-label="Positions">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => {
                setPlaying(false)
                snapTo(i)
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-6 bg-[#3e6757]" : "w-1.5 bg-white/25 hover:bg-white/40"
              }`}
              aria-label={`Aller à ${item.title}`}
            />
          ))}
        </div>
        <p className="text-[11px] text-zinc-600">Glisse horizontalement · clique une carte pour l&apos;amener devant</p>
      </div>
    </div>
  )
}
