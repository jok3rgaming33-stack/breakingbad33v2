"use client"

import { useMemo, useState } from "react"
import type { OrderThread } from "@/lib/db/schema"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { statusMeta } from "@/lib/order-status"
import { ListOrdered, Truck, Store, Copy, Check, Search, Coins } from "lucide-react"

function formatDate(value: Date | string) {
  const d = new Date(value)
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function shortToken(token: string | null) {
  if (!token) return "—"
  if (token.length <= 14) return token
  return `${token.slice(0, 8)}…${token.slice(-4)}`
}

function TokenCell({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false)

  if (!token) return <span className="text-muted-foreground">—</span>

  const copy = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copier le token complet"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground transition-colors hover:border-accent"
    >
      {shortToken(token)}
      {copied ? (
        <Check className="h-3 w-3 text-accent" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  )
}

export function AdminOrdersRecap({ threads }: { threads: OrderThread[] }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...threads].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    if (!q) return sorted
    return sorted.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        (t.customerToken ?? "").toLowerCase().includes(q) ||
        (t.products ?? "").toLowerCase().includes(q),
    )
  }, [threads, query])

  const totals = useMemo(() => {
    const revenue = threads.reduce((sum, t) => sum + (t.total ?? 0), 0)
    const points = threads.reduce((sum, t) => sum + computeLoyaltyPoints(t.total ?? 0), 0)
    return { count: threads.length, revenue, points }
  }, [threads])

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête + stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ListOrdered className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Récapitulatif des commandes</h2>
            <p className="text-xs text-muted-foreground">Toutes les commandes reçues, avec points fidélité générés.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="text-xl font-bold">{totals.count}</div>
            <div className="text-[11px] text-muted-foreground">Commandes</div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="text-xl font-bold">{totals.revenue}€</div>
            <div className="text-[11px] text-muted-foreground">Chiffre total</div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-xl font-bold text-accent">
              <Coins className="h-4 w-4" aria-hidden="true" />
              {totals.points}
            </div>
            <div className="text-[11px] text-muted-foreground">Points crédités</div>
          </div>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (pseudo, token, produit)…"
          className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pseudo</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Produits</th>
                <th className="px-4 py-3 font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Points crédités</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Aucune commande à afficher.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const meta = statusMeta(t.status)
                  return (
                    <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.customerName}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TokenCell token={t.customerToken} />
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-start gap-1.5 text-muted-foreground">
                          {t.fulfillment === "meetup" ? (
                            <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          ) : (
                            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          )}
                          <span className="text-pretty">{t.products ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{t.total}€</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                          <Coins className="h-3 w-3" aria-hidden="true" />+{computeLoyaltyPoints(t.total ?? 0)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
