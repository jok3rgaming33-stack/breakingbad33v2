"use client"

import { useState } from "react"
import Image from "next/image"
import {
  LayoutDashboard, Package, Users, ShoppingBag, MessageSquare, Newspaper,
  TrendingUp, Truck, Check, X, Clock, AlertCircle, Eye, EyeOff,
  ChevronDown, ChevronUp, Bell, LogOut
} from "lucide-react"
import { DEMO_PRODUCTS, DEMO_CLIENTS, DEMO_ORDERS, DEMO_MESSAGES, DEMO_STATS, DEMO_NEWS_SLIDES } from "@/app/demo/_data/mock"

type Tab = "dashboard" | "produits" | "clients" | "commandes" | "messagerie" | "news"

const STATUS_STYLES: Record<string, string> = {
  "livré": "bg-green-500/10 text-green-400 border-green-500/20",
  "en cours": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "confirmé": "bg-accent/10 text-accent border-accent/20",
  "en attente": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "annulé": "bg-red-500/10 text-red-400 border-red-500/20",
}

export function DemoAdmin() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [expanded, setExpanded] = useState<number | null>(null)
  const [blurPhotos] = useState(true)

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "produits", label: "Produits", icon: Package },
    { key: "clients", label: "Clients", icon: Users },
    { key: "commandes", label: "Commandes", icon: ShoppingBag },
    { key: "messagerie", label: "Messagerie", icon: MessageSquare },
    { key: "news", label: "News", icon: Newspaper },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full flex-row items-center gap-2 border-b border-border bg-card px-4 py-3 md:h-screen md:w-64 md:flex-col md:items-start md:justify-between md:border-b-0 md:border-r md:px-6 md:py-8 md:sticky md:top-9 overflow-x-auto">
        <div className="hidden md:flex md:flex-col md:gap-6 w-full">
          {/* Logo admin */}
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl">
              <Image src="/images/logoapp.png" alt="BB33" fill className="object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">BreakingBad33</p>
              <p className="text-xs text-muted-foreground">Panel Admin</p>
            </div>
          </div>
          {/* Admin badge */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <div className={`relative h-8 w-8 overflow-hidden rounded-full bg-muted ${blurPhotos ? "blur-sm" : ""}`}>
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">A</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">H•••s•••g</p>
              <p className="text-[10px] text-muted-foreground">Administrateur</p>
            </div>
          </div>
          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
        </div>
        {/* Mobile tabs */}
        <div className="flex md:hidden gap-1">
          {TABS.map(({ key, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)} className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${tab === key ? "bg-accent/10 text-accent" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <LogOut className="h-3.5 w-3.5" />
          <span>Déconnexion (démo)</span>
        </div>
      </aside>

      {/* Contenu */}
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">
        {/* ======= DASHBOARD ======= */}
        {tab === "dashboard" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Vue d&apos;ensemble de l&apos;activité</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Commandes totales", value: DEMO_STATS.totalOrders, icon: ShoppingBag, color: "text-blue-400" },
                { label: "Revenus", value: `${DEMO_STATS.totalRevenue}€`, icon: TrendingUp, color: "text-green-400" },
                { label: "Clients actifs", value: DEMO_STATS.activeClients, icon: Users, color: "text-accent" },
                { label: "En attente", value: DEMO_STATS.pendingOrders, icon: Clock, color: "text-yellow-400" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {/* Dernières commandes */}
            <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Dernières commandes</h2>
              <div className="flex flex-col gap-3">
                {DEMO_ORDERS.slice(0, 3).map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">#{o.id}</span>
                    <span className="flex-1 font-medium">{o.clientPseudo}</span>
                    <span className="font-semibold">{o.total}€</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[o.status] ?? ""}`}>{o.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Produit top */}
            <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
              <h2 className="mb-1 text-sm font-semibold text-foreground">Produit le plus vendu</h2>
              <p className="text-2xl font-bold text-accent">{DEMO_STATS.topProduct}</p>
              <p className="mt-1 text-xs text-muted-foreground">Croissance semaine : <span className="font-semibold text-green-400">{DEMO_STATS.weeklyGrowth}</span></p>
            </div>
          </div>
        )}

        {/* ======= PRODUITS ======= */}
        {tab === "produits" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Produits</h1>
                <p className="text-sm text-muted-foreground">{DEMO_PRODUCTS.length} produits au catalogue</p>
              </div>
              <button className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">+ Ajouter (démo)</button>
            </div>
            <div className="flex flex-col gap-3">
              {DEMO_PRODUCTS.map((p) => (
                <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
                    <Image src={p.image} alt={p.title} fill className="object-contain p-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.symbol} · Section : {p.section}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.stock > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      Stock : {p.stock}
                    </span>
                    <span className="text-xs text-muted-foreground">Dès {Math.min(...p.variants.map(v => v.price))}€</span>
                  </div>
                  <button className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= CLIENTS ======= */}
        {tab === "clients" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Clients</h1>
              <p className="text-sm text-muted-foreground">{DEMO_CLIENTS.length} clients inscrits · Données floutées par défaut</p>
            </div>
            <div className="flex flex-col gap-3">
              {DEMO_CLIENTS.map((c) => (
                <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  {/* Avatar flouté */}
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary blur-sm">
                    <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">?</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{c.pseudo}</p>
                    <p className="text-xs text-muted-foreground">{c.phone} · Inscrit le {c.createdAt}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-foreground">{c.totalSpent}€</span>
                    <span className="text-xs text-muted-foreground">{c.totalOrders} commandes</span>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${c.verified ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"}`}>
                    {c.verified ? "Vérifié" : "En attente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= COMMANDES ======= */}
        {tab === "commandes" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Commandes</h1>
              <p className="text-sm text-muted-foreground">{DEMO_ORDERS.length} commandes</p>
            </div>
            <div className="flex flex-col gap-3">
              {DEMO_ORDERS.map((o) => (
                <div key={o.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                    className="flex w-full items-center gap-4 p-4 text-left"
                  >
                    <span className="font-mono text-xs text-muted-foreground">#{o.id}</span>
                    <span className="flex-1 font-medium text-foreground">{o.clientPseudo}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {o.type === "livraison" ? <Truck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                      {o.type}
                    </span>
                    <span className="font-bold text-foreground">{o.total}€</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[o.status] ?? ""}`}>{o.status}</span>
                    {expanded === o.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {expanded === o.id && (
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-6 text-xs text-muted-foreground">
                          <span>Date : {o.date}</span>
                          <span>Créneau : {o.slot}</span>
                          {o.address && <span>Adresse : {o.address}</span>}
                        </div>
                        <div className="mt-2 flex flex-col gap-1">
                          {o.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{item.name}</span>
                              <span className="font-medium">{item.price}€</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          {["confirmé", "en cours", "livré"].map((s) => (
                            <button key={s} className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${o.status === s ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-accent/50"}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= MESSAGERIE ======= */}
        {tab === "messagerie" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Messagerie</h1>
              <p className="text-sm text-muted-foreground">{DEMO_MESSAGES.length} conversations actives</p>
            </div>
            <div className="flex flex-col gap-4">
              {DEMO_MESSAGES.map((conv) => (
                <div key={conv.orderId} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full bg-secondary blur-sm">
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">?</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{conv.clientPseudo}</p>
                      <p className="text-xs text-muted-foreground">Commande #{conv.orderId}</p>
                    </div>
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-2 p-4">
                    {conv.messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.from === "admin" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${msg.from === "admin" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"}`}>
                          <p>{msg.text}</p>
                          <p className="mt-1 text-[10px] opacity-60">{msg.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t border-border px-4 py-3">
                    <input placeholder="Répondre… (démo)" disabled className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm opacity-60 outline-none" />
                    <button disabled className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground opacity-60">Envoyer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= NEWS ======= */}
        {tab === "news" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Annonces News</h1>
                <p className="text-sm text-muted-foreground">Gestion des popups d&apos;annonces</p>
              </div>
              <button className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">+ Nouvelle annonce (démo)</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-2xl border border-accent/40 bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">ALERTE NOUVEAU STOCK</p>
                    <p className="text-xs text-muted-foreground">2 slides · Publiée</p>
                  </div>
                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">Active</span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {DEMO_NEWS_SLIDES.map((s, i) => (
                    <div key={s.id} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Slide {i + 1} — {s.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{s.content?.slice(0, 80)}…</p>
                        </div>
                        {s.promoCode && (
                          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent">{s.promoCode}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button disabled className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground opacity-60">Modifier (démo)</button>
                    <button disabled className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground opacity-60">Republier (démo)</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
