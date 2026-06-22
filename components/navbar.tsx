"use client"

import { useState } from "react"
import { useCart } from "@/components/cart-provider"
import { NotificationBell } from "@/components/notification-bell"
import { Menu, ShoppingCart, X, ShieldCheck, LogOut } from "lucide-react"
import Image from "next/image"

const NAV_ITEMS = [
  { label: "Nos produits", action: "featured" as const },
  { label: "Messagerie", action: "messaging" as const },
  { label: "Livraison/Meet-up", action: "delivery" as const },
  { label: "Mes commandes", action: "orders" as const },
  { label: "Espace fidélité", action: "loyalty" as const },
]

type NavbarProps = {
  isLoggedIn?: boolean
  onLogout?: () => void
  onOpenDashboard?: () => void
  onOpenLoyalty?: () => void
  onOpenOrders?: () => void
  onOpenDelivery?: () => void
  onOpenMessaging?: () => void
  isAdmin?: boolean
}

export function Navbar({
  isLoggedIn,
  onLogout,
  onOpenLoyalty,
  onOpenOrders,
  onOpenDelivery,
  onOpenMessaging,
  isAdmin,
}: NavbarProps) {
  const { count, openCart } = useCart()
  const [open, setOpen] = useState(false)

  const handleNavClick = (e: React.MouseEvent, item: (typeof NAV_ITEMS)[number]) => {
    if (item.action === "featured") {
      e.preventDefault()
      setOpen(false)
      document.getElementById("featured")?.scrollIntoView({ behavior: "smooth" })
    } else if (item.action === "messaging") {
      e.preventDefault()
      setOpen(false)
      onOpenMessaging?.()
    } else if (item.action === "loyalty") {
      e.preventDefault()
      setOpen(false)
      onOpenLoyalty?.()
    } else if (item.action === "orders") {
      e.preventDefault()
      setOpen(false)
      onOpenOrders?.()
    } else if (item.action === "delivery") {
      e.preventDefault()
      setOpen(false)
      onOpenDelivery?.()
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        
        {/* === Logo Heisenberg (face.png) === */}
        <a href="#" className="shrink-0 flex items-center" aria-label="BreakingBad33">
          <Image 
            src="/images/face.png" 
            alt="BreakingBad33" 
            width={55} 
            height={55} 
            className="h-11 w-auto object-contain" 
          />
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href="#"
              onClick={(e) => handleNavClick(e, item)}
              className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          {isAdmin && (
            <a
              href="/admin"
              className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-foreground transition-opacity hover:opacity-90"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Panel Admin
            </a>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">

          {/* Cloche de notifications (client connecté uniquement) */}
          {isLoggedIn && !isAdmin && <NotificationBell onOpenOrder={onOpenOrders} />}

          {/* === MON PANIER + Icône Caddie === */}
          <button
            onClick={openCart}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            MON PANIER
            <div className="relative flex h-8 w-8 items-center justify-center">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#22ffaa] px-1 text-[10px] font-bold text-black">
                  {count}
                </span>
              )}
            </div>
          </button>

          {/* Déconnexion (client connecté, desktop) */}
          {isLoggedIn && !isAdmin && (
            <button
              onClick={() => onLogout?.()}
              className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-white/20 hover:text-white lg:flex"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Déconnexion
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setOpen(!open)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <nav className="border-t border-border bg-background px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <a 
                key={item.label} 
                href="#" 
                onClick={(e) => handleNavClick(e, item)}
                className="rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="/admin"
                className="mt-1 flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Panel Admin
              </a>
            )}
            {isLoggedIn && !isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onLogout?.()
                }}
                className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Déconnexion
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
