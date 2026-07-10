"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useCart } from "@/components/cart-provider"
import { createOrderThread } from "@/app/actions/messaging"
import { validateCode, markLoyaltyCodeUsed } from "@/app/actions/promo"
import { needsVerification, submitVerification } from "@/app/actions/verification"
import { getCartConfig, type CartConfig, type DeliverySlot, type MeetupSlot } from "@/app/actions/settings"
import { SelfieVerificationModal, type VerificationMetadata } from "@/components/selfie-verification-modal"
import { X, Trash2, MapPin, Ticket, CalendarDays, Clock, Truck, Store, Check, Loader2, Minus, Plus, Package, Lock } from "lucide-react"

type UserData = { pseudo?: string } | null

type CheckoutCartProps = {
  userData: UserData
  onOrderPlaced?: (message: string) => void
}

const FEE_NEAR = 10 // <= 10 km
const FEE_FAR = 20 // > 10 km
const FEE_LOCKER = 10 // Locker Mondial Relay

// Config par défaut utilisée le temps du chargement (évite un panier vide).
const FALLBACK_CONFIG: CartConfig = {
  minDeliveryAmount: 50,
  deliverySlots: [
    { id: "d1", label: "14H - 17H", startHour: 14, endHour: 17 },
    { id: "d2", label: "18H - 20H", startHour: 18, endHour: 20 },
    { id: "d3", label: "21H - 02H", startHour: 21, endHour: 2 },
  ],
  meetupSlots: [
    { id: "m14", label: "14H", hour: 14 },
    { id: "m18", label: "18H", hour: 18 },
    { id: "m20", label: "20H", hour: 20 },
  ],
}

// Date du jour + n jours au format yyyy-mm-dd
function dateOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

// Convertit une date yyyy-mm-dd en nom de jour français (ex. "Lundi")
const FR_DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
function dateToFrDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return FR_DAYS[new Date(y, (m ?? 1) - 1, d ?? 1).getDay()] ?? ""
}

// Construit un Date à partir d'une date yyyy-mm-dd et d'une heure (24h).
// afterMidnight décale d'un jour (créneaux/heures qui basculent après minuit).
function slotDate(dateStr: string, hour: number, afterMidnight: boolean) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0)
  if (afterMidnight) dt.setDate(dt.getDate() + 1)
  return dt
}

// Un créneau de livraison est encore proposable si sa fin n'est pas dépassée.
function deliverySlotAvailable(dateStr: string, s: DeliverySlot, now: Date) {
  const crosses = s.endHour <= s.startHour // passe minuit
  const end = slotDate(dateStr, s.endHour, crosses)
  return end.getTime() > now.getTime()
}

// Une heure de meet-up est encore proposable si elle n'est pas dépassée.
function meetupSlotAvailable(dateStr: string, s: MeetupSlot, now: Date) {
  const afterMidnight = s.hour < 12 // ex. 00H = lendemain matin dans le cycle de soirée
  const t = slotDate(dateStr, s.hour, afterMidnight)
  return t.getTime() > now.getTime()
}

export function CheckoutCart({ userData, onOrderPlaced }: CheckoutCartProps) {
  const { items, subtotal, updateQty, removeItem, clear, isOpen, closeCart, promo, promoDiscount, applyPromo, removePromo } =
    useCart()
  const onClose = closeCart

  const [address, setAddress] = useState("")
  const [codeInput, setCodeInput] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeChecking, setCodeChecking] = useState(false)
  const [date, setDate] = useState("")
  const [slot, setSlot] = useState("")
  const [fulfillmentMode, setFulfillmentMode] = useState<"livraison" | "meetup" | "locker">("livraison")
  const isMeetup = fulfillmentMode === "meetup"
  const isLocker = fulfillmentMode === "locker"
  const [meetupHour, setMeetupHour] = useState("")
  const [lockerAddress, setLockerAddress] = useState("")
  const [xmrModalOpen, setXmrModalOpen] = useState(false)
  const [xmrConfirmed, setXmrConfirmed] = useState(false)

  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "done" | "error" | "notfound">("idle")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [placed, setPlaced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Vérification d'identité obligatoire à la 1re commande.
  const [showVerification, setShowVerification] = useState(false)
  const [verifSubmitting, setVerifSubmitting] = useState(false)
  const [verifError, setVerifError] = useState<string | null>(null)

  const name = userData?.pseudo ?? "Invité"

  // Config des créneaux (gérée depuis le panel admin), avec fallback pendant le chargement.
  const { data: cfg } = useSWR("cart-config", () => getCartConfig(), {
    fallbackData: FALLBACK_CONFIG,
    revalidateOnFocus: false,
  })
  const config = cfg ?? FALLBACK_CONFIG

  // La livraison n'est proposée qu'au-dessus du montant minimum.
  const deliveryAllowed = subtotal >= config.minDeliveryAmount

  // Si le panier repasse sous le minimum livraison, on bascule en meet-up (sauf locker qui reste dispo).
  useEffect(() => {
    if (!deliveryAllowed && fulfillmentMode === "livraison") setFulfillmentMode("meetup")
  }, [deliveryAllowed, fulfillmentMode])

  // Extrait le jour depuis le libellé d'un slot (ex: "Lundi 14h-16h" → "Lundi")
  const slotDay = (label: string) => label.split(/\s+/)[0] ?? ""

  // Créneaux proposés : filtrés par jour de la date choisie + créneaux passés masqués.
  const now = new Date()
  const availableDeliverySlots = useMemo(() => {
    if (!date) return []
    const dayName = dateToFrDay(date)
    return config.deliverySlots.filter((s) => {
      // Le jour encodé dans le label doit correspondre au jour de la date choisie.
      if (slotDay(s.label) !== dayName) return false
      // Masque les créneaux déjà passés.
      return deliverySlotAvailable(date, s, now)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.deliverySlots, date])
  const availableMeetupSlots = useMemo(() => {
    if (!date) return []
    const dayName = dateToFrDay(date)
    return config.meetupSlots.filter((s) => {
      // Même logique : filtre sur le jour dans le label.
      if (slotDay(s.label) !== dayName) return false
      // Masque les heures passées.
      return meetupSlotAvailable(date, s, now)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.meetupSlots, date])

  // Si le créneau sélectionné n'est plus disponible (ex. changement de date), on le réinitialise.
  useEffect(() => {
    if (slot && !availableDeliverySlots.some((s) => s.label === slot)) setSlot("")
  }, [availableDeliverySlots, slot])
  useEffect(() => {
    if (meetupHour && !availableMeetupSlots.some((s) => s.label === meetupHour)) setMeetupHour("")
  }, [availableMeetupSlots, meetupHour])

  // Frais de livraison selon la distance
  const deliveryFee = useMemo(() => {
    if (isMeetup) return 0
    if (isLocker) return FEE_LOCKER
    if (distanceKm == null) return 0
    return distanceKm <= 10 ? FEE_NEAR : FEE_FAR
  }, [isMeetup, isLocker, distanceKm])

  const total = Math.max(0, subtotal + deliveryFee - promoDiscount)

  if (!isOpen) return null

  // Valide un code (promo global OU fidélité) côté serveur et l'applique au panier.
  const applyCode = async () => {
    const code = codeInput.trim()
    if (!code || codeChecking) return
    setCodeChecking(true)
    setCodeError(null)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("authToken") ?? undefined : undefined
      const res = await validateCode(code, subtotal, token)
      if (res.ok) {
        applyPromo(res.promo)
        setCodeInput("")
      } else {
        setCodeError(res.error)
      }
    } catch {
      setCodeError("Impossible de vérifier ce code.")
    } finally {
      setCodeChecking(false)
    }
  }

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
        setCoords(
          typeof data.lat === "number" && typeof data.lng === "number"
            ? { lat: data.lat, lng: data.lng }
            : null,
        )
        setResolvedLabel(data.label ?? null)
        setGeoStatus("done")
      } else if (res.ok && data.found === false) {
        setDistanceKm(null)
        setCoords(null)
        setGeoStatus("notfound")
      } else {
        setDistanceKm(null)
        setCoords(null)
        setGeoStatus("error")
      }
    } catch {
      setDistanceKm(null)
      setCoords(null)
      setGeoStatus("error")
    }
  }

  const canValidate =
    items.length > 0 &&
    (isLocker
      ? !!lockerAddress.trim() && xmrConfirmed
      : !!date && (isMeetup ? !!meetupHour : !!address.trim() && !!slot && distanceKm != null))

  // Point d'entrée : à la 1re commande, on impose d'abord la vérification d'identité.
  const handleValidate = async () => {
    if (!canValidate || submitting) return
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") ?? undefined : undefined
    try {
      if (await needsVerification(token)) {
        setShowVerification(true)
        return
      }
    } catch {
      // En cas d'erreur de contrôle, on n'empêche pas la commande légitime.
    }
    await placeOrder()
  }

  // Upload des médias de vérification puis enregistrement, et poursuite de la commande.
  const handleVerificationComplete = async (photo: File, video: File, meta: VerificationMetadata) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") ?? "" : ""
    if (!token) {
      setVerifError("Session expirée. Reconnecte-toi.")
      return
    }
    setVerifSubmitting(true)
    setVerifError(null)
    try {
      const upload = async (file: File, kind: "photo" | "video") => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("token", token)
        fd.append("kind", kind)
        const res = await fetch("/api/verification/upload", { method: "POST", body: fd })
        if (!res.ok) throw new Error("upload failed")
        const data = (await res.json()) as { pathname: string }
        return data.pathname
      }
      const [photoPathname, videoPathname] = await Promise.all([upload(photo, "photo"), upload(video, "video")])
      const saved = await submitVerification({
        token,
        photoPathname,
        videoPathname,
        siteName: meta.siteName,
        recordedAt: meta.recordedAt,
      })
      if (!saved.ok) {
        setVerifError(saved.error ?? "Échec de l'enregistrement.")
        return
      }
      setShowVerification(false)
      await placeOrder()
    } catch (err) {
      console.log("[v0] verification upload error:", err)
      setVerifError("Échec de l'envoi des fichiers. Réessaie.")
    } finally {
      setVerifSubmitting(false)
    }
  }

  const placeOrder = async () => {
    if (submitting) return

    const lines = items.map((i) => `• ${i.qty}x ${i.title} — ${i.price * i.qty}€`).join("\n")
    const productsShort = items.map((i) => `${i.qty}x ${i.title}`).join(", ")
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") ?? undefined : undefined
    const mode = isMeetup
      ? `Retrait sur place (meet-up) à ${meetupHour}`
        : isLocker
        ? `Retrait en Locker Mondial Relay — ${lockerAddress} — créneau ${slot} (frais ${FEE_LOCKER}€)`
        : `Livraison à ${address} — créneau ${slot} (frais ${deliveryFee}€)`

    const message = [
      `Nouvelle commande de ${name}`,
      ``,
      lines,
      ``,
      isLocker ? null : `Date : ${date}`,
      mode,
      promo && promoDiscount > 0 ? `Code ${promo.code} : -${promoDiscount}€` : null,
      ``,
      `Sous-total : ${subtotal}€`,
      (!isMeetup && deliveryFee > 0) ? `${isLocker ? "Locker" : "Livraison"} : ${deliveryFee}€` : null,
      promo && promoDiscount > 0 ? `Reduction (${promo.code}) : -${promoDiscount}€` : null,
      `TOTAL : ${total}€`,
    ]
      .filter(Boolean)
      .join("\n")

    setSubmitting(true)
    setSubmitError(null)
    try {
      await createOrderThread({
        customerName: name,
        customerToken: token,
        summary: message,
        products: productsShort,
        total,
        fulfillment: isMeetup ? "meetup" : isLocker ? "locker" : "livraison",
        address: isMeetup ? undefined : isLocker ? lockerAddress : resolvedLabel ?? address,
        lat: isMeetup || isLocker ? null : coords?.lat ?? null,
        lng: isMeetup || isLocker ? null : coords?.lng ?? null,
        scheduledDate: isLocker ? null : date,
        scheduledSlot: isLocker ? null : isMeetup ? meetupHour : slot,
      })
      // Code fidélité (BB33-...) consommé à usage unique une fois la commande passée.
      if (promo && /^BB33-/i.test(promo.code)) {
        await markLoyaltyCodeUsed(promo.code)
      }
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
    setCodeInput("")
    setCodeError(null)
    setDate("")
    setSlot("")
    setFulfillmentMode("livraison")
    setMeetupHour("")
    setLockerAddress("")
    setXmrConfirmed(false)
    setDistanceKm(null)
    setCoords(null)
    setGeoStatus("idle")
    setPlaced(false)
    onClose()
  }

  return (
    <>
    {showVerification && (
      <SelfieVerificationModal
        onComplete={handleVerificationComplete}
        submitting={verifSubmitting}
        submitError={verifError}
      />
    )}
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
                  onClick={() => deliveryAllowed && setFulfillmentMode("livraison")}
                  disabled={!deliveryAllowed}
                  aria-disabled={!deliveryAllowed}
                  title={
                    !deliveryAllowed
                      ? `Livraison disponible à partir de ${config.minDeliveryAmount}€ d'achat`
                      : undefined
                  }
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                    fulfillmentMode === "livraison" ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                  } ${!deliveryAllowed ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <Truck className="h-4 w-4" aria-hidden="true" />
                  Livraison
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode("meetup")}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                    fulfillmentMode === "meetup" ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  <Store className="h-4 w-4" aria-hidden="true" />
                  Retrait (meet-up)
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode("locker")}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                    fulfillmentMode === "locker" ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  <Package className="h-4 w-4" aria-hidden="true" />
                  Locker Mondial Relay
                </button>
              </div>
              {!deliveryAllowed && (
                <p className="mt-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  La livraison est disponible à partir de{" "}
                  <span className="font-semibold text-foreground">{config.minDeliveryAmount}€</span> d&apos;achat. Ajoute{" "}
                  <span className="font-semibold text-foreground">
                    {Math.max(0, config.minDeliveryAmount - subtotal)}€
                  </span>{" "}
                  pour y accéder, ou choisis le retrait (meet-up).
                </p>
              )}

              {/* Adresse Locker Mondial Relay */}
              {isLocker && (
                <div className="mt-5">
                  <label htmlFor="locker-address" className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-accent" aria-hidden="true" />
                    Adresse du Locker Mondial Relay
                  </label>
                  <textarea
                    id="locker-address"
                    value={lockerAddress}
                    onChange={(e) => setLockerAddress(e.target.value)}
                    rows={2}
                    placeholder="Ex. Locker Le Clerc — 12 rue de la Paix, 75001 Paris"
                    className="w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <p className="text-xs text-accent">Adresse transmise chiffrée — jamais stockée en clair</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Frais d&apos;envoi Locker : <span className="font-semibold text-foreground">{FEE_LOCKER}€</span>. Saisis l&apos;adresse exacte du point Locker Mondial Relay choisi.
                  </p>

                  {/* Obligation de lire le tuto XMR avant de valider */}
                  <div className="mt-3 rounded-2xl border border-border bg-background/60 p-4">
                    <p className="mb-3 text-sm font-semibold">Paiement requis avant expedition</p>
                    <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                      Les commandes Locker sont expedieees uniquement apres reception du paiement en <span className="font-semibold text-foreground">Monero (XMR)</span>. Tu dois lire le tutoriel de paiement avant de valider ta commande.
                    </p>
                    <button
                      type="button"
                      onClick={() => setXmrModalOpen(true)}
                      className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                    >
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      Lire le tutoriel paiement XMR
                    </button>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${xmrConfirmed ? "border-accent bg-accent/10" : "border-border"}`}>
                      <input
                        type="checkbox"
                        checked={xmrConfirmed}
                        onChange={(e) => setXmrConfirmed(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="text-xs leading-relaxed">
                        J&apos;ai lu et compris le tutoriel de paiement XMR. Je sais que ma commande sera expedieee apres reception du paiement.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Adresse de livraison à domicile */}
              <div className={`mt-5 ${isMeetup || isLocker ? "pointer-events-none opacity-40 hidden" : ""}`}>
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
                    setCoords(null)
                    setResolvedLabel(null)
                  }}
                  onBlur={checkAddress}
                  disabled={isMeetup}
                  rows={2}
                  placeholder="N°, rue, code postal, ville"
                  className="w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
                />
                <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <p className="text-xs text-accent">Adresse transmise chiffrée — jamais stockée en clair</p>
                </div>
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

              {/* Code promo / fidélité (champ unique validé côté serveur) */}
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Ticket className="h-4 w-4 text-accent" aria-hidden="true" />
                  Code promo / fidélité
                </div>
                {promo ? (
                  <div className="flex items-center justify-between rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2.5">
                    <span className="font-mono text-sm font-semibold text-accent">{promo.code}</span>
                    <button
                      type="button"
                      onClick={removePromo}
                      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Retirer
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value)
                        setCodeError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          applyCode()
                        }
                      }}
                      placeholder="Saisis ton code"
                      className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2.5 font-mono text-sm uppercase outline-none transition-colors focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={applyCode}
                      disabled={!codeInput.trim() || codeChecking}
                      className="flex shrink-0 items-center justify-center rounded-2xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      {codeChecking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Appliquer"}
                    </button>
                  </div>
                )}
                {codeError && <p className="mt-1.5 text-xs text-destructive">{codeError}</p>}
                {promo && promoDiscount === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Atteins {promo.minAmount}€ d&apos;achat pour activer cette réduction.
                  </p>
                )}
              </div>

              {/* Locker : pas de date ni créneau, délai fixe */}
              {isLocker && (
                <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-background/60 px-4 py-3">
                  <CalendarDays className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <p className="text-sm text-foreground">
                    Livraison en <span className="font-semibold">3 à 5 jours ouvrés</span> après validation de la commande.
                  </p>
                </div>
              )}

              {/* Date (J+3 max) — masquée pour locker */}
              {!isLocker && (
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
              )}

              {/* Créneaux — masqués pour locker */}
              {!isLocker && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
                  {isMeetup ? "Heure de retrait (14H - 00H)" : "Créneau horaire"}
                </div>
                {!date ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                    Choisis d&apos;abord une date pour voir les créneaux disponibles.
                  </p>
                ) : !isMeetup ? (
                  availableDeliverySlots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                      Aucun créneau de livraison disponible le <span className="font-semibold text-foreground">{dateToFrDay(date)}</span>. Essaie un autre jour.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableDeliverySlots.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSlot(s.label)}
                          className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                            slot === s.label ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )
                ) : availableMeetupSlots.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                    Aucun meet-up disponible le <span className="font-semibold text-foreground">{dateToFrDay(date)}</span>. Essaie un autre jour.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableMeetupSlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setMeetupHour(s.label)}
                        className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                          meetupHour === s.label ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
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
              {promo && (
                <div className="mb-1 flex items-center justify-between text-sm text-accent">
                  <span className="flex items-center gap-1.5">
                    Promo {promo.code}
                    <button
                      type="button"
                      onClick={removePromo}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Retirer la promo"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                  <span>
                    {promoDiscount > 0 ? `-${promoDiscount}€` : `min. ${promo.minAmount}€`}
                  </span>
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
                  {isLocker
                    ? "Renseigne l'adresse du Locker pour valider."
                    : isMeetup
                      ? "Renseigne l'heure de retrait et la date pour valider."
                      : "Renseigne l'adresse, le créneau et la date pour valider."}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modale XMR — tutoriel paiement Monero (contenu a enrichir a la demande) */}
      {xmrModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setXmrModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Paiement Monero (XMR)</h2>
              <button
                type="button"
                onClick={() => setXmrModalOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-3 py-2 text-sm text-muted-foreground">
              <Lock className="h-8 w-8 text-accent opacity-80" aria-hidden="true" />
              <p className="font-semibold text-foreground">Pourquoi Monero (XMR) ?</p>
              <p className="leading-relaxed">
                Monero est une cryptomonnaie confidentielle et intraçable. Ton paiement est invisible sur la blockchain, ce qui protege ta vie privee et la notre.
              </p>
              <p className="font-semibold text-foreground">Comment payer ?</p>
              <ol className="flex flex-col gap-1.5 pl-1 text-xs leading-relaxed">
                <li><span className="font-semibold text-foreground">1.</span> Installe un wallet XMR (Cake Wallet recommande sur mobile).</li>
                <li><span className="font-semibold text-foreground">2.</span> Achete des XMR sur un exchange (Kraken, Binance) ou en P2P (LocalMonero).</li>
                <li><span className="font-semibold text-foreground">3.</span> Apres avoir valide ta commande, tu recevras une adresse XMR dans la messagerie.</li>
                <li><span className="font-semibold text-foreground">4.</span> Envoie le montant exact. La commande est expediee a reception.</li>
              </ol>
              <p className="text-xs text-muted-foreground">Le tuto complet sera enrichi prochainement. Pour toute question, utilise la messagerie.</p>
            </div>
            <button
              type="button"
              onClick={() => { setXmrConfirmed(true); setXmrModalOpen(false) }}
              className="mt-4 w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              J&apos;ai compris, je confirme
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
