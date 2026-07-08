"use client"

import { useEffect, useRef, useState } from "react"
import { X, ChevronLeft, ChevronRight, Ticket, Check, Loader2 } from "lucide-react"
import { getActiveNewsForUser, markNewsRead, redeemPromo } from "@/app/actions/news"
import { mediaUrl } from "@/lib/media-url"
import { useCart } from "@/components/cart-provider"

type Slide = {
  id: number
  newsId: number
  order: number
  title: string | null
  content: string | null
  imageUrl: string | null
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

export function NewsPopup({ token }: { token?: string }) {
  const { applyPromo } = useCart()
  const [data, setData] = useState<ActiveNews | null>(null)
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [redeeming, setRedeeming] = useState<number | null>(null)
  const [claimed, setClaimed] = useState<Record<number, boolean>>({})
  const touchStartX = useRef<number | null>(null)

  // Charge la news active non vue par ce client à l'entrée du site.
  useEffect(() => {
    let cancelled = false
    getActiveNewsForUser(token)
      .then((res) => {
        if (cancelled || !res) return
        setData(res as ActiveNews)
        setOpen(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])

  if (!open || !data) return null

  const slides = data.slides
  const slide = slides[index]
  const total = slides.length

  const close = () => {
    setOpen(false)
    // Enregistre la lecture pour ne pas réafficher ce popup.
    markNewsRead(token, data.news.id).catch(() => {})
  }

  const goTo = (i: number) => setIndex((i + total) % total)
  const next = () => goTo(index + 1)
  const prev = () => goTo(index - 1)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 50) prev()
    else if (dx < -50) next()
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
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-accent/40 bg-card"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Image — hauteur libre pour afficher l'image entière sans rognage */}
        {slide?.imageUrl && (
          <div className="w-full overflow-hidden bg-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(slide.imageUrl)}
              alt={slide.title ?? ""}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        {/* Contenu du slide */}
        <div className="flex flex-col gap-3 p-6">
          {slide?.title && <h2 className="text-2xl font-bold text-balance">{slide.title}</h2>}
          {slide?.content && (
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{slide.content}</p>
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
                  {slide.promoValue}× {slide.productName} offert{(slide.promoValue ?? 0) > 1 ? "s" : ""} (présent dans le panier).
                </p>
              )}
              {!!slide?.minAmount && slide.minAmount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Valable dès {slide.minAmount}€ d&apos;achat.
                </p>
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
        </div>

        {/* Navigation carousel */}
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
