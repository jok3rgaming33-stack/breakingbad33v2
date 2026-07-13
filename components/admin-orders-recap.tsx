"use client"

import { useMemo, useState } from "react"
import type { OrderThread } from "@/lib/db/schema"
import { deleteOrderThread, getThread } from "@/app/actions/messaging"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { statusMeta } from "@/lib/order-status"
import { ListOrdered, Truck, Store, Package, Copy, Check, Search, Coins, Trash2, Loader2, AlertTriangle, Eye, X, Calendar } from "lucide-react"

type ThreadMessage = { id: number; sender: string; body: string; createdAt: Date | string }
type ThreadDetail = { messages: ThreadMessage[] } & OrderThread

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

type Period = "all" | "week" | "month"

function startOf(period: Period): Date | null {
  if (period === "all") return null
  const now = new Date()
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  }
  // Semaine : lundi de la semaine en cours
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1 // 0=lun … 6=dim
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - day)
  return monday
}

const PERIOD_LABELS: Record<Period, string> = {
  all: "Tout",
  week: "Cette semaine",
  month: "Ce mois",
}

export function AdminOrdersRecap({ threads }: { threads: OrderThread[] }) {
  const [query, setQuery] = useState("")
  const [period, setPeriod] = useState<Period>("all")
  const [rows, setRows] = useState<OrderThread[]>(threads)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<OrderThread | null>(null)
  const [detailThread, setDetailThread] = useState<ThreadDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null)

  const openDetail = async (order: OrderThread) => {
    setLoadingDetail(order.id)
    try {
      const data = await getThread(order.id)
      if (data) setDetailThread({ ...order, messages: data.messages as ThreadMessage[] })
    } finally {
      setLoadingDetail(null)
    }
  }

  const periodFiltered = useMemo(() => {
    const start = startOf(period)
    if (!start) return rows
    return rows.filter((t) => new Date(t.createdAt) >= start)
  }, [rows, period])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...periodFiltered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    if (!q) return sorted
    return sorted.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        (t.customerToken ?? "").toLowerCase().includes(q) ||
        (t.products ?? "").toLowerCase().includes(q),
    )
  }, [periodFiltered, query])

  const totals = useMemo(() => {
    const revenue = periodFiltered.reduce((sum, t) => sum + (t.total ?? 0), 0)
    const points = periodFiltered.reduce((sum, t) => sum + computeLoyaltyPoints(t.total ?? 0), 0)
    return { count: periodFiltered.length, revenue, points }
  }, [periodFiltered])

  const handleDelete = async (order: OrderThread) => {
    setPendingId(order.id)
    try {
      const res = await deleteOrderThread(order.id)
      if (res.ok) setRows((prev) => prev.filter((t) => t.id !== order.id))
    } finally {
      setPendingId(null)
      setConfirmOrder(null)
    }
  }

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

      {/* Filtres période + recherche */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-background/60 p-1">
          <Calendar className="ml-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (pseudo, token, produit)…"
            className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>
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
                <th className="px-4 py-3 font-medium">Points crédités</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
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
                          ) : t.fulfillment === "locker" ? (
                            <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          ) : (
                            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                          )}
                          <span className="text-pretty">{t.products ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{t.total}€</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                          <Coins className="h-3 w-3" aria-hidden="true" />+{computeLoyaltyPoints(t.total ?? 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(t)}
                            disabled={loadingDetail === t.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                            aria-label={`Voir la commande #${t.id}`}
                          >
                            {loadingDetail === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Voir
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmOrder(t)}
                            disabled={pendingId === t.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                            aria-label={`Supprimer la commande #${t.id}`}
                          >
                            {pendingId === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale detail du thread */}
      {detailThread && (
        <div
          className="fixed inset-0 z-[110] flex items-start justify-end bg-black/60 p-0"
          onClick={() => setDetailThread(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setDetailThread(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <div>
                <h3 className="text-sm font-bold">Commande #{detailThread.id} — {detailThread.customerName}</h3>
                <p className="text-xs text-muted-foreground">
                  {detailThread.fulfillment === "locker" ? "Locker MR — 3 a 5j" : detailThread.fulfillment === "meetup" ? "Retrait meet-up" : "Livraison"}
                  {detailThread.scheduledDate ? ` · ${detailThread.scheduledDate}` : ""}
                  {detailThread.scheduledSlot ? ` · ${detailThread.scheduledSlot}` : ""}
                </p>
              </div>
              <span className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusMeta(detailThread.status).badge}`}>
                {statusMeta(detailThread.status).label}
              </span>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {detailThread.messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucun message dans ce fil.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {detailThread.messages.map((m) => (
                    <li key={m.id} className={`flex flex-col gap-1 rounded-2xl p-3 text-sm ${m.sender === "client" ? "bg-accent/15 text-foreground" : "bg-secondary text-foreground"}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {m.sender === "client" ? detailThread.customerName : "Le Chimiste"} · {new Date(m.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation de suppression */}
      {confirmOrder && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression de la commande"
        >
          <div className="w-full max-w-sm rounded-3xl border border-destructive/40 bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">Supprimer la commande ?</h3>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              La commande{" "}
              <span className="font-semibold text-foreground">#{confirmOrder.id}</span> de{" "}
              <span className="font-semibold text-foreground">{confirmOrder.customerName}</span> et tous
              ses messages seront définitivement supprimés.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOrder(null)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmOrder)}
                disabled={pendingId === confirmOrder.id}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pendingId === confirmOrder.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
