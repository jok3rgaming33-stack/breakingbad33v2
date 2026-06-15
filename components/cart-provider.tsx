"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

type ToastState = { id: number; message: string } | null

type CartContextType = {
  count: number
  addToCart: (label: string) => void
  toast: ToastState
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)
  const [toast, setToast] = useState<ToastState>(null)

  const addToCart = useCallback((label: string) => {
    setCount((c) => c + 1)
    const id = Date.now()
    setToast({ id, message: `${label} added to cart` })
    setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t))
    }, 2200)
  }, [])

  return (
    <CartContext.Provider value={{ count, addToCart, toast }}>
      {children}
      <Toast toast={toast} />
    </CartContext.Provider>
  )
}

function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
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
