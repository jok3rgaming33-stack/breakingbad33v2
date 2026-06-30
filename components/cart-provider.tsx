"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type ToastState = { id: number; message: string } | null

export type CartItem = {
  title: string
  price: number
  qty: number
}

// Promo issue d'une news ou de l'admin.
// type: "percent" (%), "fixed" (€), "produit" (value unités offertes de productName).
export type CartPromo = {
  code: string
  type: "percent" | "fixed" | "produit"
  value: number
  minAmount: number
  productName?: string | null
}

type CartContextType = {
  count: number
  items: CartItem[]
  subtotal: number
  addToCart: (title: string, price?: number) => void
  removeItem: (title: string) => void
  updateQty: (title: string, qty: number) => void
  clear: () => void
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  toast: ToastState
  promo: CartPromo | null
  promoDiscount: number
  applyPromo: (promo: CartPromo) => void
  removePromo: () => void
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [toast, setToast] = useState<ToastState>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [promo, setPromo] = useState<CartPromo | null>(null)

  const addToCart = useCallback((title: string, price = 0) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.title === title)
      if (existing) {
        return prev.map((i) => (i.title === title ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { title, price, qty: 1 }]
    })
    const id = Date.now()
    setToast({ id, message: `${title} ajouté au panier` })
    setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t))
    }, 2200)
  }, [])

  const removeItem = useCallback((title: string) => {
    setItems((prev) => prev.filter((i) => i.title !== title))
  }, [])

  const updateQty = useCallback((title: string, qty: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.title !== title) return [i]
        if (qty <= 0) return []
        return [{ ...i, qty }]
      }),
    )
  }, [])

  const clear = useCallback(() => {
    setItems([])
    setPromo(null)
  }, [])
  const openCart = useCallback(() => setIsOpen(true), [])
  const closeCart = useCallback(() => setIsOpen(false), [])

  const applyPromo = useCallback((p: CartPromo) => {
    setPromo(p)
    const id = Date.now()
    setToast({ id, message: `Promo ${p.code} ajoutée à ton panier` })
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2600)
  }, [])
  const removePromo = useCallback(() => setPromo(null), [])

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items])
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items])

  // Remise promo : appliquée seulement si le montant minimum est atteint.
  const promoDiscount = useMemo(() => {
    if (!promo) return 0
    if (subtotal < promo.minAmount) return 0
    if (promo.type === "produit") {
      // Offre `value` unité(s) du produit nommé : on déduit son prix unitaire * nb offert.
      const target = items.find((i) => i.title.toLowerCase() === (promo.productName ?? "").trim().toLowerCase())
      if (!target) return 0
      const freeQty = Math.min(promo.value, target.qty)
      return Math.min(target.price * freeQty, subtotal)
    }
    const raw = promo.type === "percent" ? Math.round((subtotal * promo.value) / 100) : promo.value
    return Math.min(raw, subtotal)
  }, [promo, subtotal, items])

  return (
    <CartContext.Provider
      value={{
        count,
        items,
        subtotal,
        addToCart,
        removeItem,
        updateQty,
        clear,
        isOpen,
        openCart,
        closeCart,
        toast,
        promo,
        promoDiscount,
        applyPromo,
        removePromo,
      }}
    >
      {children}
      <Toast toast={toast} />
    </CartContext.Provider>
  )
}

function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4"
    >
      {toast && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent/30 bg-card/95 px-5 py-3 text-sm font-medium text-foreground shadow-2xl shadow-black/50 backdrop-blur transition-all">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
