"use client"

import { useEffect, useState } from "react"
import { getUser360, type User360Data } from "@/app/actions/user-360"
import { OrderStatusTimeline } from "@/components/order-status-timeline"
import { statusMeta } from "@/lib/order-status"
import { X, Loader2, MapPin, Package, Gift, Shield, Activity, MessageSquare } from "lucide-react"

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type Props = {
  userId: number
  onClose: () => void
}

export function AdminUser360({ userId, onClose }: Props) {
  const [data, setData] = useState<User360Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    getUser360(userId)
      .then((d) => {
        if (cancelled) return
        if (!d) setError("Profil introuvable ou non autorisé.")
        else setData(d)
      })
      .catch(() => {
        if (!cancelled) setError("Erreur de chargement.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-background/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fiche client 360"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Fiche client 360°</h2>
            <p className="text-xs text-muted-foreground">Vue consolidée compte · commandes · connexions</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : error || !data ? (
            <p className="py-12 text-center text-sm text-destructive">{error || "Erreur"}</p>
          ) : (
            <div className="space-y-6">
              {/* Identité */}
              <section className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold">{data.pseudo}</p>
                    {data.nickname && (
                      <p className="text-sm text-muted-foreground">Surnom : {data.nickname}</p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">{data.token}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Inscrit le {formatDate(data.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${data.tier.tier.color}`}>
                      {data.tier.tier.label}
                    </span>
                    {data.flags.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium"
                      >
                        {f}
                      </span>
                    ))}
                    {data.mustSetPassword && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
                        mdp à définir
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Points", value: data.points },
                    { label: "CA livré", value: `${data.totalSpentDelivered}€` },
                    { label: "Commandes", value: data.orderCount },
                    { label: "Actives", value: data.activeOrders },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className="text-lg font-bold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5" /> Code parrain :{" "}
                    <span className="font-mono font-semibold text-foreground">{data.referralCode || "—"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> {data.discussionCount} discussion
                    {data.discussionCount !== 1 ? "s" : ""} · {data.unreadVendorMessages} msg non lu
                    {data.unreadVendorMessages !== 1 ? "s" : ""} (client)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" /> KYC :{" "}
                    {data.verification ? data.verification.status : "aucune"}
                  </span>
                </div>
              </section>

              {/* Commandes */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Package className="h-4 w-4 text-accent" aria-hidden="true" />
                  Commandes récentes
                </h3>
                {data.orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune commande.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.orders.slice(0, 8).map((o) => {
                      const meta = statusMeta(o.status)
                      return (
                        <li key={o.id} className="rounded-2xl border border-border bg-background/40 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">
                                #{o.id} · {o.total}€ · {o.fulfillment}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{o.summary}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>
                          <OrderStatusTimeline status={o.status} fulfillment={o.fulfillment} compact />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* Connexions */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                  Dernières connexions
                </h3>
                {data.recentLogins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune connexion journalisée.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border">
                    {data.recentLogins.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {[l.city, l.country].filter(Boolean).join(", ") || l.ip || "—"}
                        </span>
                        <span className="font-mono text-muted-foreground">{formatDate(l.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Codes fidélité */}
              {data.loyaltyCodes.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Gift className="h-4 w-4 text-accent" aria-hidden="true" />
                    Codes fidélité
                  </h3>
                  <ul className="space-y-1.5">
                    {data.loyaltyCodes.map((c) => (
                      <li
                        key={c.code}
                        className={`flex justify-between rounded-xl border px-3 py-2 font-mono text-xs ${
                          c.used ? "border-border opacity-50" : "border-accent/30 bg-accent/5"
                        }`}
                      >
                        <span>{c.code}</span>
                        <span>
                          -{c.discount}€ {c.used ? "· utilisé" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
