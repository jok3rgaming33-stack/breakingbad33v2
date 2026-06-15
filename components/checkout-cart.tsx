"use client"

import { useMemo, useState } from "react"
import { useCart } from "@/components/cart-provider"
import { createOrderThread } from "@/app/actions/messaging"
import { X, Trash2, MapPin, Ticket, CalendarDays, Clock, Truck, Store, Check, Loader2, Minus, Plus } from "lucide-react"

type UserData = { pseudo?: string } | null

type CheckoutCartProps = {
  userData: UserData
  onOrderPlaced?: (message: string) => void
}

const FEE_NEAR = 10 // <= 10 km
const FEE_FAR = 20 // > 10 km

const DELIVERY_SLOTS = ["14H - 17H", "18H - 20H", "21H - 02H"]
const MEETUP_HOURS = ["14H", "15H", "16H", "17H", "18H", "19H", "20H", "21H", "22H", "23H", "00H"]

// Parse un code fidélité BB33-10E-XXXXXX -> 10
function parseLoyaltyDiscount(code: string): number {
  const match = code.trim().toUpperCase().match(/^BB33-(\d+)E-/)
  return match ? Number(match[1]) : 0
}

// Date du jour + n jours au format yyyy-mm-dd
function dateOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export function CheckoutCart({ userData, onOrderPlaced }: CheckoutCartProps) {
  const { items, subtotal, updateQty, removeItem, clear, isOpen, closeCart } = useCart()
  const onClose = closeCart

  const [address, setAddress] = useState("")
  const [promoCode, setPromoCode] = useState("")
  const [loyaltyCode, setLoyaltyCode] = useState("")
  const [date, setDate] = useState("")
  const [slot, setSlot] = useState("")
  const [isMeetup, setIsMeetup] = useState(false)
  const [meetupHour, setMeetupHour] = useState("")

  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "done" | "error" | "notfound">("idle")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [placed, setPlaced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const name = userData?.pseudo ?? "Invité"

  // Frais de livraison selon la distance
  const deliveryFee = useMemo(() => {
    if (isMeetup) return 0
    if (distanceKm == null) return 0
    return distanceKm <= 10 ? FEE_NEAR : FEE_FAR
  }, [isMeetup, distanceKm])

  const loyaltyDiscount = useMemo(() => parseLoyaltyDiscount(loyaltyCode), [loyaltyCode])

  const total = Math.max(0, subtotal + deliveryFee - loyaltyDiscount)

  if (!isOpen) return null

  // Géocodage de l'adresse via la route serveur (API Adresse / BAN)
  const checkAddress = async () => {
    if (!address.trim()) return
    setGeoStatus("loading")
    setResolvedLabel(null)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (res.ok && data.found) {
        setDistanceKm(Number(data.distanceKm))
        setResolvedLabel(data.label ?? null)
        setGeoStatus("done")
      } else if (res.ok && data.found === false) {
        setDistanceKm(null)
        setGeoStatus("notfound")
      } else {
        setDistanceKm(null)
        setGeoStatus("error")
      }
    } catch {
      setDistanceKm(null)
      setGeoStatus("error")
    }
  }

  const canValidate =
    items.length > 0 &&
    !!date &&
    (isMeetup ? !!meetupHour : !!address.trim() && !!slot && distanceKm != null)

  const handleValidate = async () => {
    if (!canValidate || submitting) return

    const lines = items.map((i) => `• ${i.qty}x ${i.title} — ${i.price * i.qty}€`).join("\n")
    const mode = isMeetup
      ? `Retrait sur place (meet-up) à ${meetupHour}`
      : `Livraison à ${address} — créneau ${slot} (frais ${deliveryFee}€)`

    const message = [
      `Nouvelle commande de ${name}`,
      ``,
      lines,
      ``,
      `Date : ${date}`,
      mode,
      promoCode ? `Code promo : ${promoCode}` : null,
      loyaltyCode ? `Code fidélité : ${loyaltyCode} (-${loyaltyDiscount}€)` : null,
      ``,
      `Sous-total : ${subtotal}€`,
      !isMeetup ? `Livraison : ${deliveryFee}€` : null,
      loyaltyDiscount ? `Réduction fidélité : -${loyaltyDiscount}€` : null,
      `TOTAL : ${total}€`,
    ]
      .filter(Boolean)
      .join("\n")

    setSubmitting(true)
    setSubmitError(null)
    try {
      await createOrderThread({
        customerName: name,
        summary: message,
        total,
        fulfillment: isMeetup ? "meetup" : "livraison",
        scheduledDate: date,
        scheduledSlot: isMeetup ? meetupHour : slot,
      })
      onOrderPlaced?.(message)
      setPlaced(true)
    } catch (err) {
      console.log("[v0] Erreur validation commande:", err)
      setSubmitError("Impossible d'envoyer la commande. Réessaie dans un instant.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setPlaced(false)
    onClose()
  }

  const handleNewOrder = () => {
    clear()
    setAddress("")
    setPromoCode("")
    setLoyaltyCode("")
    setDate("")
    setSlot("")
    setIsMeetup(false)
    setMeetupHour("")
    setDistanceKm(null)
    setGeoStatus("idle")
    setPlaced(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex justify-end bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Panier"
      onClick={handleClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold">Mon panier</h2>
            <p className="text-sm text-muted-foreground">
              Client : <span className="font-mono font-semibold text-foreground">{name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {placed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Check className="h-8 w-8" aria-hidden="true" />
            </div>
            <h3 className="text-2xl font-bold text-balance">Commande validée</h3>
            <p className="text-sm text-muted-foreground text-pretty">
              Ta commande a été transmise au vendeur. Un fil de discussion a été créé dans la messagerie interne pour le suivi.
            </p>
            <button
              type="button"
              onClick={handleNewOrder}
              className="mt-2 rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Corps défilant */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Articles */}
              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Ton panier est vide.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.price}€ / unité</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(item.title, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          aria-label="Réduire la quantité"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.title, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          aria-label="Augmenter la quantité"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.title)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                          aria-label="Retirer l'article"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mode de réception */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsMeetup(false)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                    !isMeetup ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  <Truck className="h-4 w-4" aria-hidden="true" />
                  Livraison
                </button>
                <button
                  type="button"
                  onClick={() => setIsMeetup(true)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                    isMeetup ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  <Store className="h-4 w-4" aria-hidden="true" />
                  Retrait (meet-up)
                </button>
              </div>

              {/* Adresse de livraison */}
              <div className={`mt-5 ${isMeetup ? "pointer-events-none opacity-40" : ""}`}>
                <label htmlFor="address" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-accent" aria-hidden="true" />
                  Adresse de livraison
                </label>
                <textarea
                  id="address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    setGeoStatus("idle")
                    setDistanceKm(null)
                    setResolvedLabel(null)
                  }}
                  onBlur={checkAddress}
                  disabled={isMeetup}
                  rows={2}
                  placeholder="N°, rue, code postal, ville"
                  className="w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
                />
                {!isMeetup && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={checkAddress}
                      className="rounded-lg bg-secondary px-3 py-1.5 font-medium text-secondary-foreground hover:bg-muted"
                    >
                      Calculer les frais
                    </button>
                    {geoStatus === "loading" && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Vérification…
                      </span>
                    )}
                    {geoStatus === "done" && distanceKm != null && (
                      <span className="text-muted-foreground">
                        ≈ {distanceKm.toFixed(1)} km — frais {deliveryFee}€
                      </span>
                    )}
                    {geoStatus === "notfound" && <span className="text-destructive">Adresse introuvable</span>}
                    {geoStatus === "error" && <span className="text-destructive">Erreur du service de géocodage</span>}
                  </div>
                )}
                {!isMeetup && geoStatus === "done" && resolvedLabel && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Adresse reconnue : {resolvedLabel}</p>
                )}
              </div>

              {/* Codes promo / fidélité */}
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Ticket className="h-4 w-4 text-accent" aria-hidden="true" />
                  Code promo / fidélité
                </div>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Code promo"
                  className="mb-2 w-full rounded-2xl border border-border bg-background/60 px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent"
                />
                <input
                  type="text"
                  value={loyaltyCode}
                  onChange={(e) => setLoyaltyCode(e.target.value)}
                  placeholder="Code fidélité (ex. BB33-10E-XXXXXX)"
                  className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent"
                />
                {loyaltyDiscount > 0 && (
                  <p className="mt-1.5 text-xs text-accent">Réduction fidélité appliquée : -{loyaltyDiscount}€</p>
                )}
              </div>

              {/* Date (J+3 max) */}
              <div className="mt-5">
                <label htmlFor="date" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" />
                  Date souhaitée (sous 3 jours max)
                </label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  min={dateOffset(0)}
                  max={dateOffset(3)}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent [color-scheme:dark]"
                />
              </div>

              {/* Créneaux */}
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
                  {isMeetup ? "Heure de retrait (14H - 00H)" : "Créneau horaire"}
                </div>
                {!isMeetup ? (
                  <div className="grid grid-cols-3 gap-2">
                    {DELIVERY_SLOTS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(s)}
                        className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                          slot === s ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {MEETUP_HOURS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setMeetupHour(h)}
                        className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                          meetupHour === h ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Récap + validation */}
            <div className="border-t border-white/10 px-6 py-5">
              <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                <span>Sous-total</span>
                <span>{subtotal}€</span>
              </div>
              {!isMeetup && (
                <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                  <span>Livraison</span>
                  <span>{distanceKm != null ? `${deliveryFee}€` : "—"}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="mb-1 flex justify-between text-sm text-accent">
                  <span>Réduction fidélité</span>
                  <span>-{loyaltyDiscount}€</span>
                </div>
              )}
              <div className="mb-4 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{total}€</span>
              </div>
              <button
                type="button"
                onClick={handleValidate}
                disabled={!canValidate || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitting ? "Envoi en cours..." : "Valider ma commande"}
              </button>
              {submitError && <p className="mt-2 text-center text-xs text-destructive">{submitError}</p>}
              {!canValidate && items.length > 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Renseigne {isMeetup ? "l'heure de retrait et la date" : "l'adresse, le créneau et la date"} pour valider.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
