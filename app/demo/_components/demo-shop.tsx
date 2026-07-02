"use client"

import { useState } from "react"
import Image from "next/image"
import { FlaskConical, Sparkles, X, ShoppingCart, Ticket, Check, Truck, Store, CalendarDays, Clock } from "lucide-react"
import { DEMO_PRODUCTS, DEMO_NEWS_SLIDES } from "@/app/demo/_data/mock"
import { resolveBadges } from "@/lib/badges"
import { ProductBadges } from "@/components/product-badge"

type CartItem = { name: string; price: number; qty: number }

const DELIVERY_SLOTS = ["14H - 17H", "18H - 20H", "21H - 02H"]
const MEETUP_HOURS = ["14H", "15H", "18H", "19H", "20H", "21H", "22H", "23H"]

function dateOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export function DemoShop() {
  const [selected, setSelected] = useState<(typeof DEMO_PRODUCTS)[0] | null>(null)
  const [variantIdx, setVariantIdx] = useState(0)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [isMeetup, setIsMeetup] = useState(false)
  const [date, setDate] = useState(dateOffset(1))
  const [slot, setSlot] = useState("")
  const [meetupHour, setMeetupHour] = useState("")
  const [promo, setPromo] = useState<string | null>(null)
  const [promoInput, setPromoInput] = useState("")
  const [promoError, setPromoError] = useState<string | null>(null)
  const [orderPlaced, setOrderPlaced] = useState(false)
  // Popup news
  const [newsOpen, setNewsOpen] = useState(true)
  const [newsIdx, setNewsIdx] = useState(0)

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const deliveryFee = isMeetup ? 0 : subtotal >= 50 ? 10 : 20
  const promoDiscount = promo ? Math.round(subtotal * 0.1) : 0
  const total = subtotal + deliveryFee - promoDiscount
  const deliveryAllowed = subtotal >= 50

  const addToCart = (name: string, price: number) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.name === name)
      if (ex) return prev.map((i) => (i.name === name ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { name, price, qty: 1 }]
    })
    setSelected(null)
    setCartOpen(true)
  }

  const removeItem = (name: string) => setCart((p) => p.filter((i) => i.name !== name))
  const updateQty = (name: string, qty: number) =>
    qty <= 0 ? removeItem(name) : setCart((p) => p.map((i) => (i.name === name ? { ...i, qty } : i)))

  const applyPromo = () => {
    if (promoInput.trim().toUpperCase() === "BLUSKY10") {
      setPromo("BLUSKY10")
      setPromoError(null)
    } else {
      setPromoError("Code invalide ou déjà utilisé.")
    }
  }

  const placeOrder = () => {
    const hasSlot = isMeetup ? !!meetupHour : !!slot
    if (!date || !hasSlot) return
    setOrderPlaced(true)
    setCartOpen(false)
    setCart([])
    setTimeout(() => setOrderPlaced(false), 5000)
  }

  const phares = DEMO_PRODUCTS.filter((p) => p.section === "phares")
  const concentres = DEMO_PRODUCTS.filter((p) => p.section === "concentres")

  return (
    <>
      {/* Popup News démo */}
      {newsOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-accent/40 bg-card">
            <button
              type="button"
              onClick={() => setNewsOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-foreground hover:bg-background"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col gap-3 p-6">
              {DEMO_NEWS_SLIDES[newsIdx] && (
                <>
                  <h2 className="text-2xl font-bold">{DEMO_NEWS_SLIDES[newsIdx]?.title}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{DEMO_NEWS_SLIDES[newsIdx]?.content}</p>
                  {DEMO_NEWS_SLIDES[newsIdx]?.promoCode && (
                    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
                      <div className="flex items-center gap-2">
                        <Ticket className="h-5 w-5 text-accent" />
                        <span className="font-mono text-lg font-bold text-accent">{DEMO_NEWS_SLIDES[newsIdx]?.promoCode}</span>
                        <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                          {DEMO_NEWS_SLIDES[newsIdx]?.promoLabel}
                        </span>
                      </div>
                      <button
                        onClick={() => { setPromo("BLUSKY10"); setNewsOpen(false) }}
                        className="mt-3 w-full rounded-2xl bg-accent py-3 text-sm font-bold text-accent-foreground"
                      >
                        J&apos;ajoute la promo à mon panier
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {DEMO_NEWS_SLIDES.length > 1 && (
              <div className="flex items-center justify-between border-t border-border px-6 py-4">
                <button onClick={() => setNewsIdx((i) => (i - 1 + DEMO_NEWS_SLIDES.length) % DEMO_NEWS_SLIDES.length)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">←</button>
                <div className="flex gap-2">
                  {DEMO_NEWS_SLIDES.map((_, i) => (
                    <button key={i} onClick={() => setNewsIdx(i)} className={`h-2 rounded-full transition-all ${i === newsIdx ? "w-6 bg-accent" : "w-2 bg-muted-foreground/40"}`} />
                  ))}
                </div>
                <button onClick={() => setNewsIdx((i) => (i + 1) % DEMO_NEWS_SLIDES.length)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">→</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation commande */}
      {orderPlaced && (
        <div className="fixed inset-x-0 top-14 z-[200] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-accent/40 bg-card px-4 py-3 shadow-xl">
          <Check className="h-5 w-5 text-accent" />
          <p className="text-sm font-medium">Commande simulée confirmée ! (démo)</p>
        </div>
      )}

      {/* Navbar démo */}
      <nav className="sticky top-9 z-50 flex items-center justify-between border-b border-white/10 bg-black/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-lg">
            <Image src="/images/logoapp.png" alt="BB33" fill className="object-cover" />
          </div>
          <span className="text-sm font-bold text-white">BreakingBad33</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
            D•••o U•••r
          </span>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {cart.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#3e6757]">Laboratoire Clandestin</p>
        <h1 className="mb-6 text-5xl font-light tracking-tight text-white md:text-7xl">Breaking<span className="font-bold">Bad</span><span className="text-[#3e6757]">33</span></h1>
        <p className="max-w-md text-zinc-400">La pureté avant tout. Discrétion absolue.</p>
      </section>

      {/* Section Phares */}
      <section id="phares" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-20 pt-10">
        <div className="mb-12 flex items-center gap-4">
          <FlaskConical className="h-8 w-8 text-[#3e6757]" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#3e6757]">Sélection</p>
            <h2 className="text-4xl font-light tracking-tight text-white">Produits Phares</h2>
          </div>
        </div>
        <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {phares.map((p) => {
            const badges = resolveBadges(p.badges as string[], p.stock)
            const out = p.stock <= 0
            const minPrice = Math.min(...p.variants.map((v) => v.price))
            return (
              <div
                key={p.id}
                onClick={() => !out && (setSelected(p), setVariantIdx(0))}
                className={`group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 text-center transition-all ${out ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#3e6757]/50"}`}
              >
                <ProductBadges badges={badges} />
                <div className="relative mb-6 h-40 w-40">
                  <Image src={p.image} alt={p.title} fill className="object-contain" />
                </div>
                {p.symbol && <span className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">{p.symbol}</span>}
                <h3 className="mb-2 text-lg font-semibold text-white">{p.title}</h3>
                <p className="mb-3 text-xs text-zinc-500">{out ? "Rupture de stock" : `Dès ${minPrice}€ · stock ${p.stock}`}</p>
                <button className="w-full rounded-full border border-white/10 py-2 text-xs text-white transition-colors hover:bg-white hover:text-black">
                  {out ? "Indisponible" : "Détails"}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section Concentrés */}
      <section id="concentres" className="mx-auto max-w-[1200px] px-4 py-20">
        <div className="mb-12 flex items-center gap-4">
          <Sparkles className="h-8 w-8 text-[#3e6757]" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#3e6757]">Spécialités</p>
            <h2 className="text-4xl font-light tracking-tight text-white">Concentrés</h2>
          </div>
        </div>
        <div className="grid gap-6 grid-cols-2 md:grid-cols-3">
          {concentres.map((p) => {
            const badges = resolveBadges(p.badges as string[], p.stock)
            const out = p.stock <= 0
            const minPrice = Math.min(...p.variants.map((v) => v.price))
            return (
              <div
                key={p.id}
                onClick={() => !out && (setSelected(p), setVariantIdx(0))}
                className={`group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 text-center transition-all ${out ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#3e6757]/50"}`}
              >
                <ProductBadges badges={badges} />
                <div className="relative mb-6 h-40 w-40">
                  <Image src={p.image} alt={p.title} fill className="object-contain" />
                </div>
                {p.symbol && <span className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">{p.symbol}</span>}
                <h3 className="mb-2 text-lg font-semibold text-white">{p.title}</h3>
                <p className="mb-3 text-xs text-zinc-500">{out ? "Rupture de stock" : `Dès ${minPrice}€ · stock ${p.stock}`}</p>
                <button className="w-full rounded-full border border-white/10 py-2 text-xs text-white transition-colors hover:bg-white hover:text-black">
                  {out ? "Indisponible" : "Détails"}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Modal produit */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] md:flex-row" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute right-6 top-6 z-50 text-white/50 hover:text-white">
              <X className="h-6 w-6" />
            </button>
            <div className="relative flex w-full items-center justify-center bg-[#050505]/50 p-12 md:w-1/2">
              <div className="relative h-64 w-64">
                <Image src={selected.image} alt={selected.title} fill className="object-contain" />
              </div>
            </div>
            <div className="flex w-full flex-col justify-center p-12 md:w-1/2">
              {selected.number && (
                <span className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#3e6757]">Code {selected.number}</span>
              )}
              <h3 className="mb-4 text-4xl font-bold text-white">{selected.title}</h3>
              <p className="mb-6 leading-relaxed text-zinc-400">{selected.fullDescription}</p>
              <select
                value={variantIdx}
                onChange={(e) => setVariantIdx(Number(e.target.value))}
                className="mb-6 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
              >
                {selected.variants.map((v, i) => {
                  const price = selected.discountType === "percent" && selected.discountValue
                    ? Math.round(v.price * (1 - selected.discountValue / 100))
                    : v.price
                  return (
                    <option key={i} value={i}>{v.qty} — {price}€{price !== v.price ? ` (au lieu de ${v.price}€)` : ""}</option>
                  )
                })}
              </select>
              <div className="mb-6 text-2xl font-semibold text-white">
                {(() => {
                  const v = selected.variants[variantIdx]!
                  return selected.discountType === "percent" && selected.discountValue
                    ? Math.round(v.price * (1 - selected.discountValue / 100))
                    : v.price
                })()}€
              </div>
              <button
                onClick={() => {
                  const v = selected.variants[variantIdx]!
                  const price = selected.discountType === "percent" && selected.discountValue
                    ? Math.round(v.price * (1 - selected.discountValue / 100))
                    : v.price
                  addToCart(`${selected.title} ×${v.qty}`, price)
                }}
                className="w-full rounded-full bg-[#3e6757] py-4 text-sm font-bold uppercase tracking-widest text-white hover:bg-[#3e6757]/80"
              >
                Ajouter au Laboratoire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panier démo */}
      {cartOpen && (
        <div className="fixed inset-0 z-[150] flex items-start justify-end bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 className="text-lg font-bold">Ton Laboratoire</h2>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Ton laboratoire est vide.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {cart.map((item) => (
                    <div key={item.name} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.price}€</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(item.name, item.qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-sm">−</button>
                        <span className="w-5 text-center text-sm">{item.qty}</span>
                        <button onClick={() => updateQty(item.name, item.qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-sm">+</button>
                      </div>
                      <button onClick={() => removeItem(item.name)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-6 flex flex-col gap-4">
                  {/* Mode livraison */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => deliveryAllowed && setIsMeetup(false)}
                      disabled={!deliveryAllowed}
                      className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${!isMeetup ? "border-accent bg-accent/10" : "border-border text-muted-foreground"} ${!deliveryAllowed ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      <Truck className="h-4 w-4" />Livraison
                    </button>
                    <button
                      onClick={() => setIsMeetup(true)}
                      className={`flex items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-colors ${isMeetup ? "border-accent bg-accent/10" : "border-border text-muted-foreground"}`}
                    >
                      <Store className="h-4 w-4" />Meet-up
                    </button>
                  </div>
                  {!deliveryAllowed && (
                    <p className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                      Livraison disponible à partir de <span className="font-semibold text-foreground">50€</span>. Ajoute{" "}
                      <span className="font-semibold text-foreground">{50 - subtotal}€</span> pour y accéder.
                    </p>
                  )}

                  {/* Date */}
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input type="date" value={date} min={dateOffset(0)} onChange={(e) => setDate(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
                  </div>

                  {/* Créneaux */}
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {isMeetup ? "Heure de meet-up" : "Créneau de livraison"}
                    </div>
                    {!isMeetup ? (
                      <div className="grid grid-cols-3 gap-2">
                        {DELIVERY_SLOTS.map((s) => (
                          <button key={s} onClick={() => setSlot(s)} className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${slot === s ? "border-accent bg-accent/10" : "border-border text-muted-foreground"}`}>{s}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {MEETUP_HOURS.map((h) => (
                          <button key={h} onClick={() => setMeetupHour(h)} className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${meetupHour === h ? "border-accent bg-accent/10" : "border-border text-muted-foreground"}`}>{h}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Code promo */}
                  <div>
                    <div className="flex gap-2">
                      <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Code promo" className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
                      <button onClick={applyPromo} className="rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:border-accent">
                        <Ticket className="h-4 w-4" />
                      </button>
                    </div>
                    {promoError && <p className="mt-1 text-xs text-destructive">{promoError}</p>}
                    {promo && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                        <Check className="h-3.5 w-3.5" />
                        Code {promo} appliqué — −{promoDiscount}€
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-border px-6 py-5">
                <div className="mb-4 flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total</span><span>{subtotal}€</span>
                  </div>
                  {!isMeetup && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Livraison</span><span>+{deliveryFee}€</span>
                    </div>
                  )}
                  {promo && (
                    <div className="flex justify-between text-accent">
                      <span>Promo {promo}</span><span>−{promoDiscount}€</span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-border pt-2 font-bold text-foreground">
                    <span>Total</span><span>{total}€</span>
                  </div>
                </div>
                <button
                  onClick={placeOrder}
                  disabled={!date || (isMeetup ? !meetupHour : !slot)}
                  className="w-full rounded-2xl bg-accent py-4 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Confirmer la commande (démo)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
