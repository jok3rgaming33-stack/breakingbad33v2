"use client"

import { useState } from "react"
import { useCart } from "@/components/cart-provider"
import { ChevronDown, Menu, ShoppingCart, X } from "lucide-react"
import Image from "next/image"

const NAV_ITEMS = [
  { label: "Engagement qualité" },
  { label: "Livraison/Meet-up" },
  { label: "Espace fidélité", action: "loyalty" as const },
  { label: "Conditions de vente" },
]

type NavbarProps = {
  onOpenLoyalty?: () => void
}

export function Navbar({ onOpenLoyalty }: NavbarProps) {
  const { count, openCart } = useCart()
  const [open, setOpen] = useState(false)

  const handleNavClick = (e: React.MouseEvent, item: (typeof NAV_ITEMS)[number]) => {
    if (item.action === "loyalty") {
      e.preventDefault()
      setOpen(false)
      onOpenLoyalty?.()
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
        </nav>

        <div className="flex items-center gap-4">
          
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
          </div>
        </nav>
      )}
    </header>
  )
}
