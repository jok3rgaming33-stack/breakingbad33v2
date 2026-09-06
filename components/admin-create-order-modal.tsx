"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import type { Product } from "@/lib/db/schema"
import { listProducts } from "@/app/actions/products"
import { getCartConfig } from "@/app/actions/settings"
import { getDeliverySlotOccupancy } from "@/app/actions/delivery-slots"
import { deliverySlotIsFull, deliverySlotRemainingLabel } from "@/lib/delivery-slots"
import { listPromoCodes } from "@/app/actions/promo"
import { adminCreateOrder, type AdminOrderItem, type AdminOrderPromo } from "@/app/actions/messaging"
import { computePromoDiscount } from "@/lib/promo-calc"
import {
  X, Plus, Minus, Loader2, Truck, Store, Package, Search, ShoppingBag, Check, Ticket,
} from "lucide-react"
import { backdropDismissProps } from "@/lib/backdrop-close"

const FEE_LOCKER = 10

// 0–10 km : 10€ | 10–20 km : 20€ | >20 km : 20€ + 1€ par km supplémentaire
function calcDeliveryFee(km: number): number {
  if (km <= 10) return 10
  if (km <= 20) return 20
  return 20 + Math.ceil(km - 20)
}

type Props = {
  customerName: string
  customerToken: string | null
  onClose: () => void
  onCreated: (orderId: number) => void
}

export function AdminCreateOrderModal({ customerName, customerToken, onClose, onCreated }: Props) {
  // Catalogue
  const { data: allProducts = [], isLoading: loadingProds } = useSWR<Product[]>("products-list", listProducts)
  const { data: config } = useSWR("cart-config", getCartConfig)

  // Articles de la commande
  const [items, setItems] = useState<AdminOrderItem[]>([])
  const [search, setSearch] = useState("")

  // Mode de livraison
  const [fulfillment, setFulfillment] = useState<"meetup" | "livraison" | "locker">("meetup")

  // Meetup
  const [meetupDate, setMeetupDate] = useState("")
  const [meetupSlot, setMeetupSlot] = useState("")

  // Livraison domicile (même logique jour + créneau que le checkout client)
  const [address, setAddress] = useState("")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [deliveryDate, setDeliveryDate] = useState("")
  const [deliverySlot, setDeliverySlot] = useState("")

  // Locker
  const [lockerAddress, setLockerAddress] = useState("")

  // Promo (même modèle panier : percent | fixed | produit)
  const { data: existingPromos = [] } = useSWR("admin-promos-create-order", listPromoCodes)
  const [promoEnabled, setPromoEnabled] = useState(false)
  const [promoSource, setPromoSource] = useState<"custom" | "existing">("custom")
  const [promoCodeId, setPromoCodeId] = useState<number | "">("")
  const [promoType, setPromoType] = useState<"fixed" | "percent" | "produit">("fixed")
  const [promoValue, setPromoValue] = useState<number | "">("")
  const [promoMinAmount, setPromoMinAmount] = useState<number | "">("")
  const [promoProductName, setPromoProductName] = useState("")
  const [promoCodeLabel, setPromoCodeLabel] = useState("ADMIN")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Calculs
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const deliveryFee = fulfillment === "meetup" ? 0
    : fulfillment === "locker" ? FEE_LOCKER
    : distanceKm != null ? calcDeliveryFee(distanceKm) : 0

  const activePromos = useMemo(
    () => (existingPromos ?? []).filter((p) => p.active),
    [existingPromos],
  )

  const promoDraft: AdminOrderPromo | null = useMemo(() => {
    if (!promoEnabled) return null
    if (promoSource === "existing" && promoCodeId !== "") {
      const c = activePromos.find((p) => p.id === promoCodeId)
      if (!c) return null
      return {
        code: c.code,
        type: c.type as "percent" | "fixed" | "produit",
        value: c.value,
        minAmount: c.minAmount ?? 0,
        productName: c.productName,
      }
    }
    return {
      code: promoCodeLabel.trim().toUpperCase() || "ADMIN",
      type: promoType,
      value: Number(promoValue) || 0,
      minAmount: Number(promoMinAmount) || 0,
      productName: promoType === "produit" ? promoProductName : null,
    }
  }, [
    promoEnabled,
    promoSource,
    promoCodeId,
    activePromos,
    promoCodeLabel,
    promoType,
    promoValue,
    promoMinAmount,
    promoProductName,
  ])

  const promoDiscount = useMemo(
    () => computePromoDiscount(items, subtotal, promoDraft),
    [items, subtotal, promoDraft],
  )
  const promoBlocked =
    !!promoDraft && promoDraft.minAmount > 0 && subtotal < promoDraft.minAmount
  const total = Math.max(0, subtotal + deliveryFee - (promoBlocked ? 0 : promoDiscount))

  const meetupSlots = config?.meetupSlots ?? []
  const deliverySlots = config?.deliverySlots ?? []
  const { data: slotOccupancy = {} } = useSWR(
    fulfillment === "livraison" && deliveryDate ? `admin-delivery-slot-occ:${deliveryDate}` : null,
    () => getDeliverySlotOccupancy(deliveryDate),
  )

  // Produits filtrés
  const filtered = allProducts.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )

  const addItem = (prod: Product) => {
    const v = prod.variants?.[0]
    const price = v?.price ?? 0
    setItems((prev) => {
      const ex = prev.find((i) => i.productId === prod.id)
      if (ex) return prev.map((i) => i.productId === prod.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { productId: prod.id, title: prod.title, qty: 1, price }]
    })
    setSearch("")
  }

  const changeVariant = (productId: number, price: number) => {
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, price } : i))
  }

  const changeQty = (productId: number, qty: number) => {
    if (qty <= 0) setItems((prev) => prev.filter((i) => i.productId !== productId))
    else setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, qty } : i))
  }

  // Estimation distance naïve : on laisse saisir manuellement pour l'instant
  // (on pourrait brancher l'API de géocodage plus tard)
  const handleSubmit = async () => {
    if (!items.length) { setError("Ajoute au moins un article."); return }
    if (fulfillment === "meetup" && (!meetupDate || !meetupSlot)) { setError("Choisis une date et un créneau meet-up."); return }
    if (fulfillment === "livraison" && !address.trim()) { setError("Saisis l'adresse de livraison."); return }
    if (fulfillment === "livraison" && (!deliveryDate || !deliverySlot)) { setError("Choisis une date et un créneau de livraison."); return }
    if (fulfillment === "locker" && !lockerAddress.trim()) { setError("Saisis l'adresse du point Locker."); return }
    if (promoEnabled && promoDraft) {
      if (promoDraft.type === "produit" && !promoDraft.productName?.trim()) {
        setError("Indique le nom du produit offert.")
        return
      }
      if (promoBlocked) {
        setError(`Minimum d'achat non atteint (min. ${promoDraft.minAmount}€).`)
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await adminCreateOrder({
        customerName,
        customerToken,
        items,
        fulfillment,
        address: fulfillment === "livraison" ? address : undefined,
        deliveryFee: fulfillment === "livraison" ? deliveryFee : undefined,
        meetupDate: fulfillment === "meetup" ? meetupDate : undefined,
        meetupSlot: fulfillment === "meetup" ? meetupSlot : undefined,
        deliveryDate: fulfillment === "livraison" ? deliveryDate : undefined,
        deliverySlot: fulfillment === "livraison" ? deliverySlot : undefined,
        lockerAddress: fulfillment === "locker" ? lockerAddress : undefined,
        promo: promoEnabled ? promoDraft : null,
      })
      if (!res.ok) { setError(res.error ?? "Erreur lors de la création."); return }
      setDone(true)
      onCreated(res.id)
    } catch (e) {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        {...backdropDismissProps(onClose)}
      >
        <div
          className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Check className="h-7 w-7" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold">Commande créée</h3>
          <p className="text-sm text-muted-foreground">
            La commande a bien été générée et le client a reçu une notification. Elle apparaît désormais dans l&apos;onglet Récap commandes.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Fermer
          </button>
        </div>
      </div>
    )
  }

  const hasOutOfStock = items.some((i) => {
    const prod = allProducts.find((p) => p.id === i.productId)
    return prod != null && prod.stock <= 0
  })

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:p-4 md:items-center"
      {...backdropDismissProps(onClose)}
    >
      <div
        className="flex h-[min(92dvh,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
          <ShoppingBag className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Créer une commande</h3>
            <p className="truncate text-xs text-muted-foreground">Pour {customerName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-5">

          {/* Articles */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Articles</p>
            <p className="text-[11px] text-muted-foreground">
              Les produits hors stock restent ajoutables (précommande).
            </p>

            {/* Ligne article */}
            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => {
                  const prod = allProducts.find((p) => p.id === item.productId)
                  return (
                    <div key={item.productId} className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5">
                      <span className="flex-1 truncate text-sm font-medium">{item.title}</span>
                      {/* Sélecteur variante */}
                      {prod?.variants && prod.variants.length > 1 && (
                        <select
                          value={item.price}
                          onChange={(e) => changeVariant(item.productId, Number(e.target.value))}
                          className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                        >
                          {prod.variants.map((v) => (
                            <option key={v.qty} value={v.price}>{v.qty} × {v.price}€</option>
                          ))}
                        </select>
                      )}
                      {/* Quantité */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQty(item.productId, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <span className="w-5 text-center text-sm font-medium">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(item.productId, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="w-14 text-right text-sm font-semibold">{item.qty * item.price}€</span>
                      <button
                        type="button"
                        onClick={() => changeQty(item.productId, 0)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Retirer"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Picker */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit à ajouter…"
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>

            {(search || !items.length) && (
              loadingProds ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-border">
                  {filtered.map((p) => {
                    const already = items.some((i) => i.productId === p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addItem(p)}
                        className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-secondary"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.title}</span>
                          {p.stock === 0 && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">Hors stock</span>
                          )}
                          {already && (
                            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">Ajouté</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Stock : {p.stock}</span>
                          {p.variants?.[0] && <span>dès {p.variants[0].price}€</span>}
                          <Plus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        </div>
                      </button>
                    )
                  })}
                  {filtered.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun produit trouvé.</p>
                  )}
                </div>
              )
            )}
          </section>

          {/* Mode de livraison */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode de livraison</p>
            <div className="grid grid-cols-3 gap-2">
              {(["meetup", "livraison", "locker"] as const).map((m) => {
                const Icon = m === "meetup" ? Store : m === "locker" ? Package : Truck
                const label = m === "meetup" ? "Meet-up" : m === "locker" ? "Locker" : "Livraison"
                const fee = m === "meetup" ? "Gratuit" : m === "locker" ? "10€" : "10–20€+"
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFulfillment(m)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-colors ${
                      fulfillment === m
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-[10px] opacity-70">{fee}</span>
                  </button>
                )
              })}
            </div>

            {/* Meetup : date + créneau */}
            {fulfillment === "meetup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={meetupDate}
                    onChange={(e) => setMeetupDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Créneau</label>
                  {meetupSlots.length > 0 ? (
                    <select
                      value={meetupSlot}
                      onChange={(e) => setMeetupSlot(e.target.value)}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="">Choisir…</option>
                      {meetupSlots.map((s) => (
                        <option key={s.id} value={s.label}>{s.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={meetupSlot}
                      onChange={(e) => setMeetupSlot(e.target.value)}
                      placeholder="ex: Dimanche 22h"
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Livraison domicile : adresse + date + créneau (comme le checkout client) */}
            {fulfillment === "livraison" && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Adresse de livraison</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rue, ville…"
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Créneau</label>
                    {deliverySlots.length > 0 ? (
                      <select
                        value={deliverySlot}
                        onChange={(e) => setDeliverySlot(e.target.value)}
                        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      >
                        <option value="">Choisir…</option>
                        {deliverySlots.map((s) => {
                          const real = slotOccupancy[s.label] ?? 0
                          const full = deliverySlotIsFull(real)
                          return (
                            <option key={s.id} value={s.label} disabled={full}>
                              {s.label} — {deliverySlotRemainingLabel(real)}
                            </option>
                          )
                        })}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={deliverySlot}
                        onChange={(e) => setDeliverySlot(e.target.value)}
                        placeholder="ex: Lundi 18h-20h"
                        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Distance estimée (km) <span className="text-muted-foreground/60">— pour calculer les frais</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={distanceKm ?? ""}
                      onChange={(e) => setDistanceKm(e.target.value ? Number(e.target.value) : null)}
                      placeholder="ex: 8"
                      className="w-28 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    {distanceKm != null && (
                      <span className="text-sm text-muted-foreground">
                        Frais : <strong className="text-foreground">{calcDeliveryFee(distanceKm)}€</strong>
                        {" "}<span className="text-xs">
                          ({distanceKm <= 10 ? "≤ 10 km" : distanceKm <= 20 ? "10–20 km" : `> 20 km (+${Math.ceil(distanceKm - 20)}€)`})
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Locker */}
            {fulfillment === "locker" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Adresse du point Locker Mondial Relay</label>
                <input
                  type="text"
                  value={lockerAddress}
                  onChange={(e) => setLockerAddress(e.target.value)}
                  placeholder="Adresse exacte du point relais…"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <p className="text-xs text-muted-foreground">Frais Locker : 10€ inclus dans le total.</p>
              </div>
            )}
          </section>

          {/* Promotion — même modèle que Codes promo (type / valeur / min. d'achat) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                Promotion
              </p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={promoEnabled}
                  onChange={(e) => setPromoEnabled(e.target.checked)}
                  className="rounded border-border"
                />
                Appliquer une promo
              </label>
            </div>

            {promoEnabled && (
              <div className="space-y-3 rounded-xl border border-border bg-background p-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPromoSource("custom")}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      promoSource === "custom"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Personnalisée
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromoSource("existing")}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      promoSource === "existing"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Code existant
                  </button>
                </div>

                {promoSource === "existing" ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Code promo actif</label>
                    <select
                      value={promoCodeId === "" ? "" : String(promoCodeId)}
                      onChange={(e) =>
                        setPromoCodeId(e.target.value ? Number(e.target.value) : "")
                      }
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="">Choisir un code…</option>
                      {activePromos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} —{" "}
                          {c.type === "percent"
                            ? `-${c.value}%`
                            : c.type === "produit"
                              ? `${c.value}× ${c.productName ?? "produit"}`
                              : `-${c.value}€`}
                          {c.minAmount > 0 ? ` · min ${c.minAmount}€` : ""}
                        </option>
                      ))}
                    </select>
                    {activePromos.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Aucun code actif. Crée-en dans l&apos;onglet Codes promo, ou saisie personnalisée.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                      <label className="text-xs font-medium text-muted-foreground">Libellé code</label>
                      <input
                        type="text"
                        value={promoCodeLabel}
                        onChange={(e) => setPromoCodeLabel(e.target.value.toUpperCase())}
                        placeholder="ADMIN"
                        className="rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <select
                        value={promoType}
                        onChange={(e) =>
                          setPromoType(e.target.value as "fixed" | "percent" | "produit")
                        }
                        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      >
                        <option value="fixed">Montant €</option>
                        <option value="percent">Pourcentage %</option>
                        <option value="produit">Produit offert</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Valeur ({promoType === "percent" ? "%" : promoType === "produit" ? "nb offert" : "€"})
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={promoValue}
                        onChange={(e) => setPromoValue(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Valeur"
                        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Minimum d&apos;achat (€)</label>
                      <input
                        type="number"
                        min={0}
                        value={promoMinAmount}
                        onChange={(e) => setPromoMinAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Min. €"
                        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                    {promoType === "produit" && (
                      <div className="flex flex-col gap-1.5 col-span-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Nom du produit offert
                        </label>
                        <input
                          type="text"
                          value={promoProductName}
                          onChange={(e) => setPromoProductName(e.target.value)}
                          placeholder="Doit correspondre au titre d'un article du panier"
                          list="admin-order-product-names"
                          className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                        />
                        <datalist id="admin-order-product-names">
                          {items.map((i) => (
                            <option key={i.productId} value={i.title} />
                          ))}
                        </datalist>
                      </div>
                    )}
                  </div>
                )}

                {promoBlocked && (
                  <p className="text-xs text-amber-400">
                    Min. d&apos;achat {promoDraft?.minAmount}€ non atteint (panier {subtotal}€).
                  </p>
                )}
                {!promoBlocked && promoDiscount > 0 && (
                  <p className="text-xs text-accent">
                    Remise calculée : −{promoDiscount}€
                    {promoDraft?.type === "produit" && promoDraft.productName
                      ? ` (${promoDraft.value}× ${promoDraft.productName})`
                      : ""}
                  </p>
                )}
              </div>
            )}
          </section>

        </div>

        {/* Pied : récap + bouton — toujours visible, hors zone de scroll */}
        <div className="shrink-0 space-y-3 border-t border-border px-5 py-4">
          {hasOutOfStock && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400">
              Un ou plusieurs articles sont hors stock : la commande sera créée quand même (précommande).
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
          )}
          {/* Récap financier */}
          {items.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="space-y-0.5 text-muted-foreground">
                <p>Sous-total : <span className="font-medium text-foreground">{subtotal}€</span></p>
                {deliveryFee > 0 && (
                  <p>
                    {fulfillment === "locker" ? "Locker" : "Livraison"} : <span className="font-medium text-foreground">{deliveryFee}€</span>
                  </p>
                )}
                {promoEnabled && promoDiscount > 0 && !promoBlocked && (
                  <p className="text-accent">
                    Promo{promoDraft?.code ? ` ${promoDraft.code}` : ""} :{" "}
                    <span className="font-medium">−{promoDiscount}€</span>
                  </p>
                )}
              </div>
              <p className="text-base font-bold text-foreground">TOTAL {total}€</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-input py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !items.length}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              }
              Générer la commande
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
