"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useCart } from "@/components/cart-provider"
import { createOrderThread } from "@/app/actions/messaging"
import { validateCode, markLoyaltyCodeUsed } from "@/app/actions/promo"
import { needsVerification, submitVerification } from "@/app/actions/verification"
import { getCustomerStats } from "@/app/actions/account"
import { consumeReservationsForOrder } from "@/app/actions/product-reservations"
import { getCartConfig, type CartConfig, type DeliverySlot, type MeetupSlot } from "@/app/actions/settings"
import { getDeliverySlotOccupancy } from "@/app/actions/delivery-slots"
import {
  DELIVERY_SLOT_CAPACITY,
  DELIVERY_SLOT_RESERVED,
  deliverySlotIsFull,
  deliverySlotRemaining,
  deliverySlotRemainingLabel,
  deliverySlotTakenDisplay,
} from "@/lib/delivery-slots"
import { SelfieVerificationModal, type VerificationMetadata } from "@/components/selfie-verification-modal"
import { X, Trash2, MapPin, Ticket, CalendarDays, Clock, Truck, Store, Check, Loader2, Minus, Plus, Package, Lock, HeartPulse } from "lucide-react"
import { backdropDismissProps } from "@/lib/backdrop-close"

type UserData = { pseudo?: string } | null

type CheckoutCartProps = {
  userData: UserData
  onOrderPlaced?: (message: string) => void
  onOpenHarmReduction?: () => void
}

const FEE_LOCKER = 10 // Locker Mondial Relay

// 0–10 km : 10€ | 10–20 km : 20€ | >20 km : 20€ + 1€ par km supplémentaire
function calcDeliveryFee(km: number): number {
  if (km <= 10) return 10
  if (km <= 20) return 20
  return 20 + Math.ceil(km - 20)
}

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

// Date locale du jour + n jours au format yyyy-mm-dd (évite le décalage UTC de toISOString)
function dateOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Cutoff horaire — quand la date mini bascule à demain :
 *   - Lun–Jeu : après 23h20 → demain
 *   - Dimanche : après 23h20 → demain
 *   - Ven–Sam : PAS de cut 23h20 (soirée ouverte)
 *   - Matin Sam/Dim avant 01h20 : extension de la nuit Ven/Sam (toujours aujourd'hui)
 *   - Après 01h20 Sam/Dim : journée normale (aujourd'hui reste dispo)
 *
 * Bug corrigé : l'ancienne règle "Ven–Sam après 01h20 → J+1" bloquait
 * TOUTE la journée samedi/vendredi (créneaux d'aujourd'hui invisibles).
 */
function getOrderCutoff(now: Date): { minDate: string; isCutoff: boolean; cutoffLabel: string } {
  const day = now.getDay() // 0=Dim … 6=Sam
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  const CUT_WEEKDAY = 23 * 60 + 20 // 23h20

  let isCutoff = false
  let cutoffLabel = ""

  // Ven (5) : ouvert toute la journée et la nuit jusqu'au samedi 01h20 → jamais de bascule J+1 le vendredi
  // Sam (6) avant 01h20 : encore la nuit de vendredi → aujourd'hui OK
  // Sam (6) après 01h20 : journée samedi normale → aujourd'hui OK (pas de cut 23h20 le samedi soir)
  // Dim (0) avant 01h20 : encore la nuit de samedi → aujourd'hui OK
  // Dim (0) après 01h20 : dimanche normal, cut 23h20 le soir
  // Lun–Jeu : cut 23h20

  if (day === 5 || day === 6) {
    // Vendredi & Samedi : pas de bascule forcée sur demain en journée
    isCutoff = false
  } else if (day === 0 && totalMinutes < 1 * 60 + 20) {
    // Dimanche 00:00–01:19 : extension nuit samedi
    isCutoff = false
  } else if (totalMinutes >= CUT_WEEKDAY) {
    // Dim (après 01h20) + Lun–Jeu : fermeture 23h20
    isCutoff = true
    cutoffLabel =
      "Les commandes sont fermées après 23h20. Le premier créneau disponible est demain."
  }

  const minDate = isCutoff ? dateOffset(1) : dateOffset(0)
  return { minDate, isCutoff, cutoffLabel }
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

export function CheckoutCart({ userData, onOrderPlaced, onOpenHarmReduction }: CheckoutCartProps) {
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
  const [lockerConfirmed, setLockerConfirmed] = useState(false)
  /** Locker : XMR ou Paysafecard */
  const [lockerPayMethod, setLockerPayMethod] = useState<"xmr" | "paysafecard">("xmr")
  const [xmrModalOpen, setXmrModalOpen] = useState(false)
  const [pscModalOpen, setPscModalOpen] = useState(false)
  const [payConfirmed, setPayConfirmed] = useState(false)
  const [cryptoPayment, setCryptoPayment] = useState<{
    enabled: boolean
    payUrl?: string | null
    payAddress?: string | null
    payAmount?: string | null
  } | null>(null)

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

  const occupancyKey =
    date && fulfillmentMode === "livraison" ? `delivery-slot-occ:${date}` : null
  const { data: slotOccupancy = {} } = useSWR(
    occupancyKey,
    () => getDeliverySlotOccupancy(date),
    { revalidateOnFocus: true, refreshInterval: 20_000 },
  )

  // La livraison n'est proposée qu'au-dessus du montant minimum.
  const deliveryAllowed = subtotal >= config.minDeliveryAmount

  // Si le panier repasse sous le minimum livraison, on bascule en meet-up (sauf locker qui reste dispo).
  useEffect(() => {
    if (!deliveryAllowed && fulfillmentMode === "livraison") setFulfillmentMode("meetup")
  }, [deliveryAllowed, fulfillmentMode])

  // Jour FR d'un créneau : days[] admin, sinon préfixe du label ("Lundi 14h"), sinon tous les jours
  const slotMatchesDay = (s: { label: string; days?: string[] }, dayName: string) => {
    if (s.days && s.days.length > 0) return s.days.includes(dayName)
    const first = (s.label.split(/\s+/)[0] ?? "").trim()
    if (FR_DAYS.includes(first)) return first === dayName
    return true // ex. "14H - 17H" sans jour → disponible chaque jour
  }

  // Règle de cutoff horaire (23h20 lun–jeu/dim ; ven–sam ouverts).
  const now = new Date()
  const { minDate, isCutoff, cutoffLabel } = getOrderCutoff(now)
  const availableDeliverySlots = useMemo(() => {
    if (!date) return []
    const dayName = dateToFrDay(date)
    return config.deliverySlots.filter((s) => {
      if (!slotMatchesDay(s, dayName)) return false
      return deliverySlotAvailable(date, s, now)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.deliverySlots, date])
  const availableMeetupSlots = useMemo(() => {
    if (!date) return []
    const dayName = dateToFrDay(date)
    return config.meetupSlots.filter((s) => {
      if (!slotMatchesDay(s, dayName)) return false
      return meetupSlotAvailable(date, s, now)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.meetupSlots, date])

  // Si la date choisie est antérieure au minDate (cutoff vient de passer), on la réinitialise.
  useEffect(() => {
    if (date && date < minDate) setDate("")
  }, [date, minDate])

  // Si le créneau sélectionné n'est plus disponible (ex. changement de date / complet), on le réinitialise.
  useEffect(() => {
    if (!slot) return
    const stillListed = availableDeliverySlots.some((s) => s.label === slot)
    const full = deliverySlotIsFull(slotOccupancy[slot] ?? 0)
    if (!stillListed || full) setSlot("")
  }, [availableDeliverySlots, slot, slotOccupancy])
  useEffect(() => {
    if (meetupHour && !availableMeetupSlots.some((s) => s.label === meetupHour)) setMeetupHour("")
  }, [availableMeetupSlots, meetupHour])

  // Avantages Platine (mois offert OU rachat 150 pts)
  const [freeDeliveryActive, setFreeDeliveryActive] = useState(false)
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(90)
  const [canRedeemFreeDelivery, setCanRedeemFreeDelivery] = useState(false)
  const [freeDeliveryPointsCost, setFreeDeliveryPointsCost] = useState(150)
  const [loyaltyPoints, setLoyaltyPoints] = useState(0)
  const [isPlatinum, setIsPlatinum] = useState(false)
  const [redeemPtsForDelivery, setRedeemPtsForDelivery] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    if (!token) {
      setFreeDeliveryActive(false)
      setCanRedeemFreeDelivery(false)
      setIsPlatinum(false)
      return
    }
    getCustomerStats(token)
      .then((s) => {
        setFreeDeliveryActive(!!s.freeDeliveryActive)
        setFreeDeliveryMin(s.freeDeliveryMinOrder || 90)
        setCanRedeemFreeDelivery(!!s.canRedeemFreeDelivery)
        setFreeDeliveryPointsCost(s.freeDeliveryPointsCost || 150)
        setLoyaltyPoints(s.points ?? 0)
        setIsPlatinum(s.tierId === "platinum")
      })
      .catch(() => {
        setFreeDeliveryActive(false)
        setCanRedeemFreeDelivery(false)
      })
  }, [isOpen])

  // Frais de livraison selon la distance (+ offre Platine)
  const rawDeliveryFee = useMemo(() => {
    if (isMeetup) return 0
    if (isLocker) return FEE_LOCKER
    if (distanceKm == null) return 0
    return calcDeliveryFee(distanceKm)
  }, [isMeetup, isLocker, distanceKm])

  const monthFreeApplied =
    freeDeliveryActive &&
    !isMeetup &&
    !isLocker &&
    fulfillmentMode === "livraison" &&
    subtotal >= freeDeliveryMin &&
    rawDeliveryFee > 0

  const ptsFreeApplied =
    !monthFreeApplied &&
    redeemPtsForDelivery &&
    canRedeemFreeDelivery &&
    !isMeetup &&
    !isLocker &&
    fulfillmentMode === "livraison" &&
    rawDeliveryFee > 0

  const freeDeliveryApplied = monthFreeApplied || ptsFreeApplied

  const deliveryFee = freeDeliveryApplied ? 0 : rawDeliveryFee

  const total = Math.max(0, subtotal + deliveryFee - promoDiscount)
  const isLoyaltyCode = !!(promo && /^BB33-/i.test(promo.code))
  const loyaltyDiscountAmount = isLoyaltyCode ? promoDiscount : 0

  if (!isOpen) return null

  // Valide un code (promo global OU fidélité) côté serveur et l'applique au panier.
  const applyCode = async () => {
    const code = codeInput.trim()
    if (!code || codeChecking) return
    // Empêcher le cumul : un seul coupon actif par commande.
    if (promo) {
      setCodeError("Un code est déjà appliqué. Retire-le avant d'en saisir un autre.")
      return
    }
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

  const selectedSlotRemaining =
    !isMeetup && !isLocker && slot ? deliverySlotRemaining(slotOccupancy[slot] ?? 0) : 1

  const canValidate =
    items.length > 0 &&
    (isLocker
      ? !!lockerAddress.trim() && lockerConfirmed && payConfirmed
      : !!date &&
        (isMeetup
          ? !!meetupHour
          : !!address.trim() && !!slot && distanceKm != null && selectedSlotRemaining > 0))

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
    const productIds = items.flatMap((i) => i.productId ? Array(i.qty).fill(i.productId) : []).filter((v, idx, arr) => arr.indexOf(v) === idx)
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") ?? undefined : undefined
    const mode = isMeetup
      ? `Retrait sur place (meet-up) à ${meetupHour}`
        : isLocker
        ? `Retrait en Locker Mondial Relay — ${lockerAddress} (frais ${FEE_LOCKER}€)`
        : monthFreeApplied
          ? `Livraison à ${address} — créneau ${slot} (💎 mois offert Platine ≥${freeDeliveryMin}€)`
          : ptsFreeApplied
            ? `Livraison à ${address} — créneau ${slot} (💎 -${freeDeliveryPointsCost} pts Platine)`
            : `Livraison à ${address} — créneau ${slot} (frais ${deliveryFee}€)`

    const payLine = isLocker
      ? `Paiement : ${lockerPayMethod === "paysafecard" ? "Paysafecard" : "Monero (XMR)"}`
      : null

    const message = [
      `Nouvelle commande de ${name}`,
      ``,
      lines,
      ``,
      isLocker ? null : `Date : ${date}`,
      mode,
      payLine,
      promo && promoDiscount > 0 ? `Code ${promo.code} : -${promoDiscount}€` : null,
      ``,
      `Sous-total : ${subtotal}€`,
      (!isMeetup && deliveryFee > 0) ? `${isLocker ? "Locker" : "Livraison"} : ${deliveryFee}€` : null,
      monthFreeApplied ? `Livraison : offerte (mois Platine)` : null,
      ptsFreeApplied ? `Livraison : offerte (−${freeDeliveryPointsCost} pts)` : null,
      promo && promoDiscount > 0 ? `Reduction (${promo.code}) : -${promoDiscount}€` : null,
      `TOTAL : ${total}€`,
    ]
      .filter(Boolean)
      .join("\n")

    setSubmitting(true)
    setSubmitError(null)
    setCryptoPayment(null)
    try {
      const orderRes = await createOrderThread({
        customerName: name,
        customerToken: token,
        summary: message,
        products: productsShort,
        productIds,
        total,
        loyaltyDiscount: loyaltyDiscountAmount,
        promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
        fulfillment: isMeetup ? "meetup" : isLocker ? "locker" : "livraison",
        address: isMeetup ? undefined : isLocker ? lockerAddress : resolvedLabel ?? address,
        lat: isMeetup || isLocker ? null : coords?.lat ?? null,
        lng: isMeetup || isLocker ? null : coords?.lng ?? null,
        scheduledDate: isLocker ? undefined : date,
        scheduledSlot: isLocker ? undefined : isMeetup ? meetupHour : slot,
        paymentMethod: isLocker ? lockerPayMethod : null,
        redeemFreeDeliveryPoints: ptsFreeApplied,
      })
      if (!orderRes || (typeof orderRes === "object" && "ok" in orderRes && orderRes.ok === false)) {
        const errMsg =
          orderRes && typeof orderRes === "object" && "error" in orderRes && orderRes.error
            ? String(orderRes.error)
            : "Impossible d'envoyer la commande. Réessaie dans un instant."
        setSubmitError(errMsg)
        return
      }
      // Code fidélité (BB33-...) consommé à usage unique une fois la commande passée.
      if (promo && /^BB33-/i.test(promo.code)) {
        await markLoyaltyCodeUsed(promo.code)
      }
      // Consomme les réservations Platine des produits commandés
      if (token && productIds.length > 0) {
        await consumeReservationsForOrder(token, productIds).catch(() => {})
      }
      if (orderRes && typeof orderRes === "object" && "cryptoPayment" in orderRes) {
        const cp = (orderRes as { cryptoPayment?: typeof cryptoPayment }).cryptoPayment
        if (cp?.enabled) setCryptoPayment(cp)
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
    setLockerPayMethod("xmr")
    setPayConfirmed(false)
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
      {...backdropDismissProps(handleClose)}
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
              Ta commande a été transmise au vendeur.
              {isLocker
                ? " Après confirmation du paiement, tu recevras ton token TRK_ en messagerie pour le suivi Locker."
                : " Paiement en espèces au rendez-vous. Un fil a été créé dans la messagerie pour le suivi."}
            </p>

            {/* Crypto uniquement Locker XMR — jamais livraison / meet-up */}
            {isLocker && cryptoPayment?.enabled && lockerPayMethod === "xmr" && (
              <div className="mt-2 w-full max-w-sm rounded-2xl border border-accent/40 bg-accent/10 p-4 text-left">
                <p className="mb-1 text-sm font-bold text-accent">Paiement Monero (XMR)</p>
                {cryptoPayment.payAmount && (
                  <p className="mb-1 font-mono text-sm text-foreground">
                    {cryptoPayment.payAmount} XMR
                  </p>
                )}
                {cryptoPayment.payAddress && (
                  <p className="mb-3 break-all font-mono text-[11px] text-muted-foreground">
                    {cryptoPayment.payAddress}
                  </p>
                )}
                {cryptoPayment.payUrl ? (
                  <a
                    href={cryptoPayment.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                  >
                    Payer en XMR
                  </a>
                ) : cryptoPayment.payAddress ? (
                  <p className="text-xs text-muted-foreground">
                    Envoie le montant XMR à l&apos;adresse ci-dessus (aussi dans ta messagerie).
                  </p>
                ) : null}
              </div>
            )}

            {isLocker && lockerPayMethod === "paysafecard" && (
              <div className="mt-2 w-full max-w-sm rounded-2xl border border-accent/40 bg-accent/10 p-4 text-left">
                <p className="mb-1 text-sm font-bold text-accent">Paiement Paysafecard</p>
                <p className="mb-2 text-xs text-muted-foreground leading-relaxed">
                  Achète ton code uniquement sur le site officiel, envoie le PIN à 16 chiffres dans ton suivi, puis
                  récupère ton token TRK_ après confirmation.
                </p>
                <a
                  href="https://www.paysafecard.com/fr-fr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-accent underline"
                >
                  Site officiel Paysafecard →
                </a>
              </div>
            )}

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

              {/* Mode de réception — 3 chips claires + frais anticipés */}
              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors ${
                    fulfillmentMode === "livraison"
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground"
                  } ${!deliveryAllowed ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Livraison
                  </span>
                  <span className="text-[11px] leading-snug opacity-80">
                    {isPlatinum && freeDeliveryActive
                      ? `Offerte 💎 si panier ≥ ${freeDeliveryMin}€`
                      : "Dès 10€ selon distance"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode("meetup")}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors ${
                    fulfillmentMode === "meetup"
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Meet-up
                  </span>
                  <span className="text-[11px] leading-snug opacity-80">Gratuit — retrait sur place</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentMode("locker")}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors ${
                    fulfillmentMode === "locker"
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Locker
                  </span>
                  <span className="text-[11px] leading-snug opacity-80">Mondial Relay · {FEE_LOCKER}€</span>
                </button>
              </div>
              {!deliveryAllowed && (
                <p className="mt-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  La livraison est disponible à partir de{" "}
                  <span className="font-semibold text-foreground">{config.minDeliveryAmount}€</span> d&apos;achat. Ajoute{" "}
                  <span className="font-semibold text-foreground">
                    {Math.max(0, config.minDeliveryAmount - subtotal)}€
                  </span>{" "}
                  pour y accéder, ou choisis meet-up / locker.
                </p>
              )}

              {/* Bannière Platine dès l'ouverture du panier (avant géocode) */}
              {isPlatinum && fulfillmentMode === "livraison" && (
                <div className="mt-3 rounded-2xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2.5 text-xs leading-relaxed text-cyan-100">
                  {freeDeliveryActive ? (
                    <>
                      <strong className="text-cyan-200">💎 Mois Platine actif</strong> — livraison offerte sur
                      les commandes ≥ <strong>{freeDeliveryMin}€</strong>. Les frais exacts s&apos;affichent
                      après l&apos;adresse.
                    </>
                  ) : (
                    <>
                      <strong className="text-cyan-200">💎 Avantage Platine</strong> — hors fenêtre offerte, tu
                      peux rendre la livraison gratuite pour{" "}
                      <strong>{freeDeliveryPointsCost} pts</strong>
                      {loyaltyPoints < freeDeliveryPointsCost
                        ? ` (solde insuffisant : ${loyaltyPoints} pts)`
                        : ` (solde : ${loyaltyPoints} pts)`}
                      .
                      {loyaltyPoints >= freeDeliveryPointsCost && (
                        <label className="mt-2 flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
                            checked={redeemPtsForDelivery}
                            onChange={(e) => setRedeemPtsForDelivery(e.target.checked)}
                          />
                          <span>Utiliser {freeDeliveryPointsCost} pts pour cette commande</span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Adresse Locker Mondial Relay */}
              {isLocker && (
                <div className="mt-5">
                  <label htmlFor="locker-address" className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-accent" aria-hidden="true" />
                    Adresse du Locker Mondial Relay
                  </label>
                  <a
                    href="https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/15"
                  >
                    Trouver un point Locker près de moi ↗
                  </a>
                  <textarea
                    id="locker-address"
                    value={lockerAddress}
                    onChange={(e) => {
                      setLockerAddress(e.target.value)
                      setLockerConfirmed(false)
                    }}
                    rows={2}
                    placeholder="Ex. Locker Leclerc — 12 rue de la Paix, 33000 Bordeaux"
                    className="w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-2">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <p className="text-xs text-accent">Adresse transmise chiffrée — jamais stockée en clair</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Frais d&apos;envoi Locker :{" "}
                    <span className="font-semibold text-foreground">{FEE_LOCKER}€</span>. Colle l&apos;adresse
                    exacte du point choisi sur Mondial Relay.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--accent))]"
                      checked={lockerConfirmed}
                      onChange={(e) => setLockerConfirmed(e.target.checked)}
                    />
                    <span>
                      Je confirme avoir choisi un <strong className="text-foreground">Locker Mondial Relay</strong>{" "}
                      et collé son adresse complète ci-dessus.
                    </span>
                  </label>

                  {/* Choix paiement Locker : XMR ou Paysafecard */}
                  <div className="mt-3 rounded-2xl border border-border bg-background/60 p-4">
                    <p className="mb-3 text-sm font-semibold">Paiement requis avant expédition</p>
                    <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                      Choisis ton mode de paiement. Après envoi et confirmation par le vendeur, tu recevras un{" "}
                      <span className="font-semibold text-foreground">token TRK_</span> en messagerie pour débloquer le suivi Locker.
                    </p>

                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLockerPayMethod("xmr")
                          setPayConfirmed(false)
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          lockerPayMethod === "xmr"
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border text-muted-foreground hover:border-accent/40"
                        }`}
                      >
                        Monero (XMR)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLockerPayMethod("paysafecard")
                          setPayConfirmed(false)
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          lockerPayMethod === "paysafecard"
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border text-muted-foreground hover:border-accent/40"
                        }`}
                      >
                        Paysafecard
                      </button>
                    </div>

                    {lockerPayMethod === "xmr" ? (
                      <button
                        type="button"
                        onClick={() => setXmrModalOpen(true)}
                        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Lire le tutoriel paiement XMR
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPscModalOpen(true)}
                        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Lire le tutoriel Paysafecard
                      </button>
                    )}

                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                        payConfirmed ? "border-accent bg-accent/10" : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={payConfirmed}
                        onChange={(e) => setPayConfirmed(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="text-xs leading-relaxed">
                        {lockerPayMethod === "paysafecard"
                          ? "J'ai lu le tutoriel Paysafecard. J'achèterai mon code sur le site officiel et j'enverrai le PIN après validation."
                          : "J'ai lu le tutoriel XMR. Je comprends que le token de suivi sera envoyé après confirmation du dépôt."}
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
                        ≈ {distanceKm.toFixed(1)} km —{" "}
                        {freeDeliveryApplied ? (
                          <span className="text-accent">
                            livraison offerte 💎
                            {ptsFreeApplied ? ` (−${freeDeliveryPointsCost} pts)` : ""}
                          </span>
                        ) : (
                          <>frais {deliveryFee}€</>
                        )}
                      </span>
                    )}
                    {geoStatus === "notfound" && <span className="text-destructive">Adresse introuvable</span>}
                    {isPlatinum &&
                      !freeDeliveryActive &&
                      !isMeetup &&
                      !isLocker &&
                      fulfillmentMode === "livraison" &&
                      rawDeliveryFee > 0 && (
                        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-xs text-cyan-200">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
                            checked={redeemPtsForDelivery}
                            disabled={loyaltyPoints < freeDeliveryPointsCost}
                            onChange={(e) => setRedeemPtsForDelivery(e.target.checked)}
                          />
                          <span>
                            <strong>💎 Avantage Platine</strong> — livraison offerte pour{" "}
                            <strong>{freeDeliveryPointsCost} pts</strong>
                            {loyaltyPoints < freeDeliveryPointsCost
                              ? ` (solde insuffisant : ${loyaltyPoints} pts)`
                              : ` (solde : ${loyaltyPoints} pts)`}
                          </span>
                        </label>
                      )}
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
                {isCutoff && (
                  <p className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {cutoffLabel}
                  </p>
                )}
                <input
                  id="date"
                  type="date"
                  value={date}
                  min={minDate}
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
                {!isMeetup && (
                  <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                    {DELIVERY_SLOT_CAPACITY} places max par créneau de 2h — {DELIVERY_SLOT_RESERVED} déjà
                    réservée, {DELIVERY_SLOT_CAPACITY - DELIVERY_SLOT_RESERVED} restantes à prendre.
                  </p>
                )}
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {availableDeliverySlots.map((s) => {
                        const real = slotOccupancy[s.label] ?? 0
                        const remaining = deliverySlotRemaining(real)
                        const taken = deliverySlotTakenDisplay(real)
                        const full = remaining <= 0
                        const selected = slot === s.label
                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={full}
                            onClick={() => setSlot(s.label)}
                            className={`rounded-xl border p-2.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected
                                ? "border-accent bg-accent/10 text-foreground"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            <span className="block leading-tight">{s.label}</span>
                            <span className="mt-1.5 flex items-center gap-1.5">
                              <span className="flex gap-0.5" aria-hidden="true">
                                {Array.from({ length: DELIVERY_SLOT_CAPACITY }, (_, i) => (
                                  <span
                                    key={i}
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      i < taken ? "bg-accent" : "bg-border"
                                    }`}
                                  />
                                ))}
                              </span>
                              <span className={`text-[10px] ${full ? "text-destructive" : "text-muted-foreground"}`}>
                                {deliverySlotRemainingLabel(real)}
                              </span>
                            </span>
                          </button>
                        )
                      })}
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
                  <span>
                    {distanceKm == null
                      ? "—"
                      : freeDeliveryApplied
                        ? "Offerte 💎"
                        : `${deliveryFee}€`}
                  </span>
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
              <div className="mb-3 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{total}€</span>
              </div>
              {onOpenHarmReduction && (
                <button
                  type="button"
                  onClick={onOpenHarmReduction}
                  className="mb-3 flex w-full items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
                >
                  <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  <span>
                    <span className="block text-xs font-semibold text-amber-200">
                      Réduction des risques
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-amber-200/70">
                      Avant de consommer, vérifie les mélanges (alcool, médocs, autres produits).
                    </span>
                  </span>
                </button>
              )}
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
                    ? !lockerAddress.trim()
                      ? "Renseigne l'adresse du Locker pour valider."
                      : "Lis le tutoriel et coche la case paiement pour valider."
                    : isMeetup
                      ? "Renseigne l'heure de retrait et la date pour valider."
                      : "Renseigne l'adresse, le créneau et la date pour valider."}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modale XMR — tutoriel paiement Monero complet */}
      {xmrModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          {...backdropDismissProps(() => setXmrModalOpen(false))}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-3xl border border-border bg-card shadow-2xl"
            style={{ maxHeight: "90dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header fixe */}
            <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-accent opacity-80" aria-hidden="true" />
                <h2 className="text-base font-bold">Paiement Monero (XMR)</h2>
              </div>
              <button
                type="button"
                onClick={() => setXmrModalOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="flex-1 overflow-y-auto px-6 pb-2 text-sm text-muted-foreground">
              {/* Pourquoi XMR */}
              <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-3">
                <p className="mb-1 font-semibold text-foreground">Pourquoi Monero (XMR) ?</p>
                <p className="text-xs leading-relaxed">
                  Monero est une cryptomonnaie confidentielle et intraçable. Ton paiement est invisible sur la blockchain, ce qui protège ta vie privée et la nôtre. C&apos;est la méthode la plus sûre pour les deux parties.
                </p>
              </div>

              {/* Etapes */}
              <p className="mb-3 font-semibold text-foreground">Comment payer en 4 étapes</p>
              <ol className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">1</span>
                  <div>
                    <p className="font-medium text-foreground">Installe Cake Wallet</p>
                    <p className="text-xs leading-relaxed">Télécharge Cake Wallet (iOS ou Android, gratuit). C&apos;est l&apos;app tout-en-un qui gère l&apos;achat, l&apos;échange et l&apos;envoi de XMR sans compte obligatoire.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">2</span>
                  <div>
                    <p className="font-medium text-foreground">Achète du Litecoin (LTC) sur Coinbase</p>
                    <p className="text-xs leading-relaxed">Ouvre Coinbase → Acheter → Litecoin → saisis ton montant en euros. Le LTC sert de passerelle vers le XMR (moins de restrictions à l&apos;achat). Compte 2–6 % de frais au total.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">3</span>
                  <div>
                    <p className="font-medium text-foreground">Envoie directement en XMR au vendeur</p>
                    <p className="text-xs leading-relaxed">Dans Cake Wallet → Envoyer → colle l&apos;adresse XMR reçue dans ton suivi locker. Cake propose automatiquement le swap LTC→XMR (&quot;Pay Anything&quot;) et envoie les XMR directement. Choisis &quot;Taux fixe&quot; si disponible.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">4</span>
                  <div>
                    <p className="font-medium text-foreground">Confirme ton dépôt dans le suivi</p>
                    <p className="text-xs leading-relaxed">Après la transaction (10–45 min), clique sur &quot;J&apos;ai effectué mon dépôt&quot; dans ton suivi locker. Le vendeur vérifie et lance la préparation.</p>
                  </div>
                </li>
              </ol>

              {/* Email anonyme + récupération */}
              <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-3">
                <p className="mb-2 font-semibold text-foreground">Confidentialité du compte</p>
                <ul className="flex flex-col gap-2 text-xs leading-relaxed">
                  <li>
                    <span className="font-medium text-foreground">Email anonyme recommandé — </span>
                    Si une adresse email t&apos;est demandée, crée-en une exprès avec de fausses informations. On recommande{" "}
                    <span className="font-semibold text-accent">ProtonMail</span> (proton.me : gratuit, chiffré, sans identité réelle) ou{" "}
                    <span className="font-semibold text-accent">SimpleLogin</span>. N&apos;utilise jamais ton email personnel.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Récupérer ton compte — </span>
                    Depuis l&apos;app : &quot;J&apos;ai déjà une clé&quot; → colle ton token secret → accès immédiat à ton historique depuis n&apos;importe quel appareil. Note-le sur papier, hors ligne — si tu le perds, l&apos;accès est définitivement perdu.
                  </li>
                </ul>
              </div>

              {/* Conseils sécurité */}
              <div className="mt-3 mb-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="mb-1 font-semibold text-amber-400">Conseils essentiels XMR</p>
                <ul className="flex flex-col gap-1 text-xs leading-relaxed">
                  <li>— Vérifie l&apos;adresse XMR caractère par caractère : une erreur = fonds perdus définitivement.</li>
                  <li>— Note ta seed phrase Cake Wallet sur papier, jamais en photo.</li>
                  <li>— Pour tes débuts, commence par un petit montant test.</li>
                </ul>
              </div>
            </div>

            {/* Footer fixe */}
            <div className="shrink-0 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setPayConfirmed(true)
                  setXmrModalOpen(false)
                }}
                className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                J&apos;ai compris, je confirme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Paysafecard — tutoriel + liens officiels */}
      {pscModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          {...backdropDismissProps(() => setPscModalOpen(false))}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-3xl border border-border bg-card shadow-2xl"
            style={{ maxHeight: "90dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-accent opacity-80" aria-hidden="true" />
                <h2 className="text-base font-bold">Paiement Paysafecard</h2>
              </div>
              <button
                type="button"
                onClick={() => setPscModalOpen(false)}
                aria-label="Fermer"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-2 text-sm text-muted-foreground">
              <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-3">
                <p className="mb-1 font-semibold text-foreground">Qu&apos;est-ce que Paysafecard ?</p>
                <p className="text-xs leading-relaxed">
                  Un ticket prépayé avec un <span className="font-semibold text-foreground">code PIN à 16 chiffres</span>.
                  Tu l&apos;achètes en cash (tabac, supermarché) ou en ligne — <strong className="text-foreground">sans
                  carte bancaire obligatoire</strong> selon le point de vente. Aucun compte bancaire à partager avec le vendeur.
                </p>
              </div>

              <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-300">Site officiel uniquement</p>
                <p className="mb-2 text-xs leading-relaxed">
                  N&apos;achète jamais sur un site douteux. Utilise uniquement le site officiel Paysafecard :
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://www.paysafecard.com/fr-fr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-center text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
                  >
                    paysafecard.com/fr-fr — Accueil officiel
                  </a>
                  <a
                    href="https://www.paysafecard.com/fr-fr/acheter-paysafecard-en-ligne/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-border bg-background/60 px-3 py-2 text-center text-xs font-semibold text-foreground transition-colors hover:border-accent"
                  >
                    Acheter en ligne (officiel)
                  </a>
                  <a
                    href="https://www.paysafecard.com/fr-fr/trouver-un-point-de-vente/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-border bg-background/60 px-3 py-2 text-center text-xs font-semibold text-foreground transition-colors hover:border-accent"
                  >
                    Trouver un point de vente (officiel)
                  </a>
                </div>
              </div>

              <p className="mb-3 font-semibold text-foreground">Comment payer en 4 étapes</p>
              <ol className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Valide ta commande Locker</p>
                    <p className="text-xs leading-relaxed">
                      Choisis Paysafecard au checkout. Note le montant total à régler.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Achète sur le site officiel</p>
                    <p className="text-xs leading-relaxed">
                      Va sur{" "}
                      <a
                        href="https://www.paysafecard.com/fr-fr/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-accent underline"
                      >
                        paysafecard.com/fr-fr
                      </a>{" "}
                      → achat en ligne ou point de vente. Prends un ticket du <strong className="text-foreground">montant exact ou supérieur</strong> au total de la commande.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                    3
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Envoie le code PIN (16 chiffres)</p>
                    <p className="text-xs leading-relaxed">
                      Dans ton suivi Locker (après validation vendeur), envoie le PIN en message — recopié sans erreur.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                    4
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Signale puis récupère ton token</p>
                    <p className="text-xs leading-relaxed">
                      Clique sur « J&apos;ai envoyé mon code Paysafecard ». Après confirmation vendeur, tu reçois ton token{" "}
                      <span className="font-mono text-foreground">TRK_</span> en messagerie.
                    </p>
                  </div>
                </li>
              </ol>

              <div className="mt-4 mb-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="mb-1 font-semibold text-amber-400">Important</p>
                <ul className="flex flex-col gap-1 text-xs leading-relaxed">
                  <li>— Uniquement le site / points de vente officiels Paysafecard.</li>
                  <li>— Ne partage jamais ton PIN ailleurs que dans ton suivi commande.</li>
                  <li>— Vérifie les 16 chiffres avant d&apos;envoyer.</li>
                  <li>— Le token TRK_ n&apos;est envoyé qu&apos;après validation du code.</li>
                </ul>
              </div>
            </div>

            <div className="shrink-0 space-y-2 px-6 py-4">
              <a
                href="https://www.paysafecard.com/fr-fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-2xl border border-accent/50 bg-accent/10 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                Ouvrir le site officiel
              </a>
              <button
                type="button"
                onClick={() => {
                  setPayConfirmed(true)
                  setPscModalOpen(false)
                }}
                className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                J&apos;ai compris, je confirme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
