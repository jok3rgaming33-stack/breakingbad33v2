"use client"

import { useState } from "react"
import { DemoShop } from "@/app/demo/_components/demo-shop"
import { DemoAdmin } from "@/app/demo/_components/demo-admin"
import { Store, Settings2 } from "lucide-react"

type View = "boutique" | "admin"

export default function DemoPage() {
  const [view, setView] = useState<View>("boutique")

  return (
    <div className="relative">
      {/* Sélecteur de vue — flottant en bas de l'écran */}
      <div className="fixed bottom-6 left-1/2 z-[9000] -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-2 shadow-2xl">
          <button
            onClick={() => setView("boutique")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
              view === "boutique" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            Vue Client
          </button>
          <button
            onClick={() => setView("admin")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
              view === "admin" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            Vue Admin
          </button>
        </div>
      </div>

      {/* Contenu */}
      {view === "boutique" ? <DemoShop /> : <DemoAdmin />}
    </div>
  )
}
