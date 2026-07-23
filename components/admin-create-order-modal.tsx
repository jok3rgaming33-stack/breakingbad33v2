"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import type { Product } from "@/lib/db/schema"
import { listProducts } from "@/app/actions/products"
import { getCartConfig } from "@/app/actions/settings"
import { adminCreateOrder } from "@/app/actions/messaging"
import type { AdminOrderItem } from "@/app/actions/messaging"
import {
  X, Plus, Minus, Loader2, Truck, Store, Package, Search, ShoppingBag, Check,
} from "lucide-react"

const FEE_NEAR = 10
const FEE_FAR = 20
const FEE_LOCKER = 10

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

  // Livraison domicile
  const [address, setAddress] = useState("")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)

  // Locker
  const [lockerAddress, setLockerAddress] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Calculs
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const deliveryFee = fulfillment === "meetup" ? 0
    : fulfillment === "locker" ? FEE_LOCKER
    : distanceKm != null ? (distanceKm <= 10 ? FEE_NEAR : FEE_FAR) : 0
  const total = subtotal + deliveryFee

  const meetupSlots = config?.meetupSlots ?? []

  // Produits filtrés
  const filtered = allProducts.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )

  const addItem = (prod: Product) => {
    const v = prod.variants?.[0]
    if (!v) return
    setItems((prev) => {
      const ex = prev.find((i) => i.productId === prod.id)
      if (ex) return prev.map((i) => i.productId === prod.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { productId: prod.id, title: prod.title, qty: 1, price: v.price }]
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
    if (fulfillment === "locker" && !lockerAddress.trim()) { setError("Saisis l'adresse du point Locker."); return }

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
        lockerAddress: fulfillment === "locker" ? lockerAddress : undefined,
      })
      if (!res.ok) { setError("Erreur lors de la création."); return }
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
        onClick={onClose}
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 md:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
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

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">

          {/* Articles */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Articles</p>

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
                        disabled={p.stock === 0}
                        className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-secondary disabled:opacity-40"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.title}</span>
                          {p.stock === 0 && (
                            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">Rupture</span>
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
                const fee = m === "meetup" ? "Gratuit" : m === "locker" ? "10€" : "10–20€"
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

            {/* Livraison domicile */}
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
                        Frais : <strong className="text-foreground">{distanceKm <= 10 ? FEE_NEAR : FEE_FAR}€</strong>
                        {" "}<span className="text-xs">({distanceKm <= 10 ? "≤ 10 km" : "> 10 km"})</span>
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

        </div>

        {/* Pied : récap + bouton */}
        <div className="border-t border-border px-5 py-4 space-y-3">
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
