"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getAdminDashboard,
  type AdminDashboardData,
} from "@/app/actions/admin-dashboard"
import {
  Activity,
  Inbox,
  Package,
  MessageSquare,
  ShieldCheck,
  Users,
  Coins,
  RefreshCw,
  Loader2,
  Bell,
} from "lucide-react"
import { statusMeta } from "@/lib/order-status"

function formatWhen(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type Props = {
  onNavigate?: (tab: string) => void
  /** Données SSR immédiates (évite spinner infini mobile / Safari server actions). */
  seed?: AdminDashboardData | null
}

export function AdminDashboard({ onNavigate, seed = null }: Props) {
  // Mobile : afficher d'abord le seed SSR, rafraîchir en fond (pas de spinner bloquant)
  const [data, setData] = useState<AdminDashboardData | null>(seed)
  const [loading, setLoading] = useState(!seed)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true)
    else setLoading(true)
    try {
      // Timeout court mobile : Safari/PWA peut pendre les server actions
      const d = await Promise.race([
        getAdminDashboard(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ])
      if (d) setData(d)
    } catch {
      /* garde le seed si dispo */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Soft refresh si seed SSR déjà affiché ; sinon charge complète
    void load(!!seed)
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="text-sm">Chargement du tableau de bord…</p>
        <button
          type="button"
          onClick={() => onNavigate?.("commandes-en-cours")}
          className="mt-2 text-sm font-medium text-accent underline"
        >
          Aller aux commandes →
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Impossible de charger le tableau de bord (réseau mobile / session).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => load(false)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("commandes-en-cours")}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
          >
            Voir les commandes
          </button>
        </div>
      </div>
    )
  }

  const cards: {
    label: string
    value: number | string
    icon: typeof Inbox
    tab?: string
    accent?: string
  }[] = [
    { label: "Commandes en cours", value: data.ordersActive, icon: Inbox, tab: "commandes-en-cours" },
    { label: "Locker actif", value: data.lockerActive, icon: Package, tab: "locker" },
    { label: "Discussions ouvertes", value: data.discussionsOpen, icon: MessageSquare, tab: "messagerie" },
    { label: "Vérifs en attente", value: data.verificationsPending, icon: ShieldCheck, tab: "verifications" },
    { label: "Connexions 24 h", value: data.logins24h, icon: Activity, tab: "connexions" },
    { label: "Connexions aujourd'hui", value: data.loginsToday, icon: Activity, tab: "connexions" },
    { label: "Nouveaux membres (7 j)", value: data.newUsers7d, icon: Users, tab: "utilisateurs" },
    {
      label: "CA livré 30 j",
      value: `${data.revenueDelivered30d}€`,
      icon: Coins,
      tab: "profits",
      accent: "text-accent",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Tableau de bord</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Vue live · mis à jour {formatWhen(data.generatedAt)}
            {data.lockerReminders.sent > 0 && (
              <span className="ml-2 text-accent">
                · {data.lockerReminders.sent} rappel{data.lockerReminders.sent > 1 ? "s" : ""} locker envoyé
                {data.lockerReminders.sent > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tab, accent }) => (
          <button
            key={label}
            type="button"
            onClick={() => tab && onNavigate?.(tab)}
            className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-accent/50 hover:bg-secondary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
          </button>
        ))}
      </div>

      {data.unreadClientMessages > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Environ <strong>{data.unreadClientMessages}</strong> message
            {data.unreadClientMessages > 1 ? "s" : ""} client récent
            {data.unreadClientMessages > 1 ? "s" : ""} sur des fils ouverts — pense à la messagerie.
          </span>
          <button
            type="button"
            onClick={() => onNavigate?.("messagerie")}
            className="ml-auto shrink-0 rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-semibold hover:bg-amber-500/30"
          >
            Ouvrir
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Dernières connexions</h3>
            <button
              type="button"
              onClick={() => onNavigate?.("connexions")}
              className="text-xs text-accent hover:underline"
            >
              Tout voir
            </button>
          </div>
          {data.recentLogins.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Aucune connexion récente.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentLogins.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.pseudo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatWhen(l.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Dernières commandes</h3>
            <button
              type="button"
              onClick={() => onNavigate?.("commandes")}
              className="text-xs text-accent hover:underline"
            >
              Récap
            </button>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Aucune commande.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => {
                const meta = statusMeta(o.status)
                return (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        #{o.id} · {o.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {o.total}€ · {o.fulfillment}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
