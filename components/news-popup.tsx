"use client"

import { useEffect, useRef, useState } from "react"
import { X, ChevronLeft, ChevronRight, Ticket, Check, Loader2 } from "lucide-react"
import { getActiveNewsForUser, markNewsRead, redeemPromo } from "@/app/actions/news"
import { BlobMedia } from "@/components/blob-media"
import { useCart } from "@/components/cart-provider"

type MediaItem = { type: "image" | "video"; url: string }

type Slide = {
  id: number
  newsId: number
  order: number
  title: string | null
  content: string | null
  imageUrl: string | null
  media?: MediaItem[]
  buttonText: string | null
  buttonLink: string | null
  promoCode: string | null
  promoType: string | null
  promoValue: number | null
  productName: string | null
  minAmount: number | null
  isSingleUse: boolean
  promoUsed: boolean
}

type ActiveNews = {
  news: { id: number; title: string }
  slides: Slide[]
}

const DISMISSED_LS_KEY = "bb33:dismissedNews"

function readLocalDismissed(): number[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(DISMISSED_LS_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : []
  } catch {
    return []
  }
}

function addLocalDismissed(newsId: number) {
  if (typeof window === "undefined") return
  const set = new Set(readLocalDismissed())
  set.add(newsId)
  localStorage.setItem(DISMISSED_LS_KEY, JSON.stringify([...set]))
}

function slideMedia(slide: Slide | undefined): MediaItem[] {
  if (!slide) return []
  if (Array.isArray(slide.media) && slide.media.length > 0) return slide.media
  if (slide.imageUrl) {
    const isVideo = /\.(mp4|mov|m4v|webm|quicktime)(\?|$)/i.test(slide.imageUrl)
    return [{ type: isVideo ? "video" : "image", url: slide.imageUrl }]
  }
  return []
}

export function NewsPopup({ token }: { token?: string }) {
  const { applyPromo } = useCart()
  // File de toutes les news actives ; on les affiche une par une.
  const [queue, setQueue] = useState<ActiveNews[]>([])
  const [queueTotal, setQueueTotal] = useState(0) // total initial pour afficher "X/N"
  const [queuePos, setQueuePos] = useState(1) // position courante dans la file (1-indexed)
  const [index, setIndex] = useState(0)
  const [mediaIndex, setMediaIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [redeeming, setRedeeming] = useState<number | null>(null)
  const [claimed, setClaimed] = useState<Record<number, boolean>>({})
  const [dismissing, setDismissing] = useState(false)
  const touchStartX = useRef<number | null>(null)

  // Charge toutes les news actives à l'entrée (hors déjà dismissées).
  useEffect(() => {
    let cancelled = false
    getActiveNewsForUser(token)
      .then((res) => {
        if (cancelled || !res) return
        const localDismissed = new Set(readLocalDismissed())
        const arr = (Array.isArray(res) ? res : [res]).filter(
          (n) => !localDismissed.has((n as ActiveNews).news.id),
        ) as ActiveNews[]
        if (arr.length === 0) return
        setQueue(arr)
        setQueueTotal(arr.length)
        setQueuePos(1)
        setOpen(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])

  // News courante dans la file
  const data = queue[0] ?? null

  if (!open || !data) return null

  const slides = data.slides
  const slide = slides[index]
  const total = slides.length
  const media = slideMedia(slide)
  const safeMediaIndex = media.length ? Math.min(mediaIndex, media.length - 1) : 0
  const currentMedia = media[safeMediaIndex]

  // Passe à la news suivante sans marquer comme lue (session seulement).
  const skip = () => {
    const next = queue.slice(1)
    if (next.length > 0) {
      setQueue(next)
      setQueuePos((p) => p + 1)
      setIndex(0)
      setMediaIndex(0)
      setClaimed({})
    } else {
      setOpen(false)
    }
  }

  // « J'ai compris, ne plus afficher » — permanent (DB + localStorage).
  const dismissForever = async () => {
    setDismissing(true)
    try {
      addLocalDismissed(data.news.id)
      if (token) {
        await markNewsRead(token, data.news.id).catch(() => {})
      }
      skip()
    } finally {
      setDismissing(false)
    }
  }

  const goTo = (i: number) => {
    setIndex((i + total) % total)
    setMediaIndex(0)
  }
  const next = () => goTo(index + 1)
  const prev = () => goTo(index - 1)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 50) {
      if (media.length > 1 && safeMediaIndex > 0) setMediaIndex(safeMediaIndex - 1)
      else prev()
    } else if (dx < -50) {
      if (media.length > 1 && safeMediaIndex < media.length - 1) setMediaIndex(safeMediaIndex + 1)
      else next()
    }
    touchStartX.current = null
  }

  const handleRedeem = async (s: Slide) => {
    setRedeeming(s.id)
    try {
      const res = await redeemPromo(token, s.id)
      if (res.ok) {
        applyPromo(res.promo)
        setClaimed((c) => ({ ...c, [s.id]: true }))
      } else if (res.reason === "already_used") {
        setClaimed((c) => ({ ...c, [s.id]: true }))
      }
    } finally {
      setRedeeming(null)
    }
  }

  const hasPromo = Boolean(slide?.promoCode)
  const isClaimed = slide ? claimed[slide.id] || slide.promoUsed : false
  const hasValue = (slide?.promoValue ?? 0) > 0
  // Libellé du badge promo ; null si la promo n'a pas de valeur exploitable.
  const promoLabel = !hasValue
    ? null
    : slide?.promoType === "percent"
      ? `-${slide.promoValue}%`
      : slide?.promoType === "produit"
        ? `${slide.promoValue}× offert${(slide.promoValue ?? 0) > 1 ? "s" : ""}`
        : `-${slide?.promoValue}€`

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={data.news.title}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-accent/40 bg-card max-h-[90dvh]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {queueTotal > 1 && (
            <span className="rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur">
              Annonce {queuePos}/{queueTotal}
            </span>
          )}
          <button
            type="button"
            onClick={skip}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background"
            aria-label="Fermer pour cette session"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Médias (images / vidéos) — carousel si plusieurs */}
        {currentMedia && (
          <div
            className="relative w-full shrink-0 overflow-hidden bg-secondary/40 flex items-center justify-center"
            style={{ maxHeight: "45dvh" }}
          >
            <BlobMedia
              src={currentMedia.url}
              alt={slide?.title ?? ""}
              mediaType={currentMedia.type}
              className="max-h-[45dvh] w-full object-contain"
              videoProps={{
                muted: true,
                playsInline: true,
                autoPlay: false,
                controls: true,
                preload: "metadata",
                style: { maxHeight: "45dvh", width: "100%", objectFit: "contain" },
              }}
            />
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setMediaIndex((i) => (i - 1 + media.length) % media.length)}
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur"
                  aria-label="Média précédent"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setMediaIndex((i) => (i + 1) % media.length)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur"
                  aria-label="Média suivant"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {media.map((m, i) => (
                    <button
                      key={`${m.url}-${i}`}
                      type="button"
                      onClick={() => setMediaIndex(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === safeMediaIndex ? "w-5 bg-accent" : "w-1.5 bg-white/40"
                      }`}
                      aria-label={`Média ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Contenu du slide — scrollable si trop long */}
        <div className="flex flex-col gap-3 p-6 overflow-y-auto">
          {slide?.title && <h2 className="text-2xl font-bold text-balance">{slide.title}</h2>}
          {slide?.content && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{slide.content}</p>
          )}

          {/* Promo */}
          {hasPromo && (
            <div className="mt-1 rounded-2xl border border-accent/40 bg-accent/10 p-4">
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-accent" aria-hidden="true" />
                <span className="font-mono text-lg font-bold text-accent">{slide?.promoCode}</span>
                {promoLabel && (
                  <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                    {promoLabel}
                  </span>
                )}
              </div>
              {slide?.promoType === "produit" && slide?.productName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {slide.promoValue}× {slide.productName} offert{(slide.promoValue ?? 0) > 1 ? "s" : ""} (présent
                  dans le panier).
                </p>
              )}
              {!!slide?.minAmount && slide.minAmount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Valable dès {slide.minAmount}€ d&apos;achat.</p>
              )}
              <button
                type="button"
                onClick={() => slide && handleRedeem(slide)}
                disabled={isClaimed || redeeming === slide?.id}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {redeeming === slide?.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : isClaimed ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Promo déjà récupérée
                  </>
                ) : (
                  "J'ajoute la promo à mon panier"
                )}
              </button>
            </div>
          )}

          {/* Bouton libre du slide */}
          {slide?.buttonText && slide?.buttonLink && (
            <a
              href={slide.buttonLink}
              className="mt-1 flex w-full items-center justify-center rounded-2xl border border-border py-3 text-sm font-semibold transition-colors hover:border-accent"
            >
              {slide.buttonText}
            </a>
          )}

          {/* Ne plus afficher cette annonce */}
          <button
            type="button"
            onClick={dismissForever}
            disabled={dismissing}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary/40 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            {dismissing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            J&apos;ai compris, ne plus afficher
          </button>
        </div>

        {/* Navigation carousel slides */}
        {total > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={prev}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? "w-6 bg-accent" : "w-2 bg-muted-foreground/40"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === index}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={next}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
              aria-label="Suivant"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
