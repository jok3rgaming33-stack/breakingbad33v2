"use client"

import { useState } from "react"
import type { OrderThread } from "@/lib/db/schema"
import { VendorInbox } from "@/components/vendor-inbox"
import { adminLogout } from "@/app/actions/admin-auth"
import { MessageSquare, Map, ListOrdered, TrendingUp, LogOut, Construction } from "lucide-react"

type TabId = "messagerie" | "carte" | "commandes" | "profits"

const TABS: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: "messagerie", label: "Messagerie", icon: MessageSquare },
  { id: "carte", label: "Carte interactive", icon: Map },
  { id: "commandes", label: "Récap commandes", icon: ListOrdered },
  { id: "profits", label: "Profits", icon: TrendingUp },
]

const COMING_SOON: Record<Exclude<TabId, "messagerie">, { title: string; desc: string }> = {
  carte: { title: "Carte interactive", desc: "Visualisation géographique des livraisons et meet-ups. En cours de développement." },
  commandes: { title: "Récapitulatif des commandes", desc: "Liste détaillée et filtrable de toutes les commandes. En cours de développement." },
  profits: { title: "Récapitulatif des profits", desc: "Suivi des revenus, marges et statistiques de vente. En cours de développement." },
}

export function AdminPanel({ initialThreads }: { initialThreads: OrderThread[] }) {
  const [tab, setTab] = useState<TabId>("messagerie")

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold">Panel Administrateur</h1>
            <p className="text-xs text-muted-foreground">Connecté en tant que Heisenberg</p>
          </div>
          <form action={adminLogout}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Tabs */}
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Sections admin">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        {tab === "messagerie" ? (
          <VendorInbox initialThreads={initialThreads} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
            <Construction className="mb-4 h-12 w-12 text-accent" aria-hidden="true" />
            <h2 className="mb-2 text-2xl font-bold text-balance">{COMING_SOON[tab].title}</h2>
            <p className="max-w-md text-pretty text-muted-foreground">{COMING_SOON[tab].desc}</p>
          </div>
        )}
      </div>
    </div>
  )
}
