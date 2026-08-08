"use client"

import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import type { OrderThread } from "@/lib/db/schema"
import type { AdminUserRow } from "@/app/actions/account"
import type { VerificationRow } from "@/app/actions/verification"
import { VendorInbox } from "@/components/vendor-inbox"
import { AdminOrdersRecap } from "@/components/admin-orders-recap"
import { AdminUsers } from "@/components/admin-users"
import { AdminVerifications } from "@/components/admin-verifications"
import { AdminAdmins } from "@/components/admin-admins"
import { AdminStaff } from "@/components/admin-staff"
import type { StaffRow } from "@/app/actions/staff"
import { AdminRecovery } from "@/components/admin-recovery"
import { AdminMap } from "@/components/admin-map"
import { AdminNews } from "@/components/admin-news"
import { AdminProducts } from "@/components/admin-products"
import { AdminPromos } from "@/components/admin-promos"
import { AdminLogistics } from "@/components/admin-logistics"
import { AdminCartSettings } from "@/components/admin-cart-settings"
import { AdminCryptoSettings } from "@/components/admin-crypto-settings"
import { AdminLoginLogs } from "@/components/admin-login-logs"
import type { LoginLogRow } from "@/app/actions/login-logs"
import { AdminProfit } from "@/components/admin-profit"
import type { ProfitSummary } from "@/app/actions/profit"
import { AdminNotifications } from "@/components/admin-notifications"
import type { BroadcastNotificationRow } from "@/app/actions/notifications"
import { adminLogout } from "@/app/actions/admin-auth"
import { getAdminBadgeCounts } from "@/app/actions/messaging"
import { AdminAppBadgeSync } from "@/components/app-badge-sync"
import {
  MessageSquare,
  Map,
  ListOrdered,
  Users,
  TrendingUp,
  LogOut,
  Eye,
  Newspaper,
  Package,
  Ticket,
  ShieldCheck,
  UserCog,
  Truck,
  Inbox,
  Activity,
  Bell,
  CheckCheck,
  KeyRound,
  Wallet,
  Gift,
  LayoutDashboard,
  Star,
} from "lucide-react"
import Link from "next/link"
import { PushToggle } from "@/components/push-toggle"
import { AdminLoyalty } from "@/components/admin-loyalty"
import { AdminDashboard } from "@/components/admin-dashboard"
import type { AdminDashboardData } from "@/app/actions/admin-dashboard"
import { AdminRatings } from "@/components/admin-ratings"

type TabId =
  | "dashboard"
  | "commandes-en-cours"
  | "locker"
  | "cloturees"
  | "messagerie"
  | "carte"
  | "commandes"
  | "utilisateurs"
  | "verifications"
  | "recuperations"
  | "produits"
  | "promos"
  | "logistique"
  | "crypto"
  | "news"
  | "admins"
  | "profits"
  | "connexions"
  | "notifications"
  | "staff"
  | "fidelite"
  | "notations"

const TABS: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "commandes-en-cours", label: "Commandes en cours", icon: Inbox },
  { id: "locker", label: "Locker MR", icon: Package },
  { id: "cloturees", label: "Clôturées", icon: CheckCheck },
  { id: "messagerie", label: "Messagerie", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "produits", label: "Produits", icon: Package },
  { id: "promos", label: "Codes promo", icon: Ticket },
  { id: "fidelite", label: "Fidélité PF", icon: Gift },
  { id: "notations", label: "Notations", icon: Star },
  { id: "carte", label: "Carte interactive", icon: Map },
  { id: "logistique", label: "Logistique", icon: Truck },
  { id: "crypto", label: "Paiement XMR", icon: Wallet },
  { id: "commandes", label: "Récap commandes", icon: ListOrdered },
  { id: "utilisateurs", label: "Utilisateurs", icon: Users },
  { id: "verifications", label: "Vérifications", icon: ShieldCheck },
  { id: "recuperations", label: "Récupérations", icon: KeyRound },
  { id: "connexions", label: "Connexions", icon: Activity },
  { id: "news", label: "News", icon: Newspaper },
  { id: "staff", label: "Whitelist", icon: Users },
  { id: "admins", label: "Admins", icon: UserCog },
  { id: "profits", label: "Profits", icon: TrendingUp },
]

export function AdminPanel({
  initialActiveOrders,
  initialLockerOrders,
  initialDiscussions,
  initialThreads,
  initialUsers,
  initialVerifications,
  initialLoginLogs,
  initialProfitData,
  initialNotificationsHistory,
  initialPastOrders,
  initialStaff,
}: {
  initialActiveOrders: OrderThread[]
  initialLockerOrders: OrderThread[]
  initialDiscussions: OrderThread[]
  initialThreads: OrderThread[]
  initialPastOrders: OrderThread[]
  initialUsers: AdminUserRow[]
  initialVerifications: VerificationRow[]
  initialLoginLogs: LoginLogRow[]
  initialProfitData: ProfitSummary
  initialNotificationsHistory: BroadcastNotificationRow[]
  initialStaff: StaffRow[]
}) {
  // Mobile : démarrer sur commandes (SSR immédiat) plutôt que dashboard (server action).
  const [tab, setTab] = useState<TabId>("dashboard")
  const [focusThreadId, setFocusThreadId] = useState<number | null>(null)
  const [badges, setBadges] = useState({
    orders: 0,
    locker: 0,
    messaging: 0,
    verifications: 0,
    recovery: 0,
    total: 0,
  })

  // Seed dashboard depuis les données SSR déjà en page (aucun fetch mobile requis au 1er paint)
  const dashboardSeed: AdminDashboardData = {
    ordersActive: initialActiveOrders.length,
    lockerActive: initialLockerOrders.length,
    discussionsOpen: initialDiscussions.filter((t) =>
      ["discussion", "pris_en_charge", "ouvert"].includes(t.status),
    ).length,
    verificationsPending: initialVerifications.filter((v) => v.status === "pending").length,
    logins24h: initialLoginLogs.filter(
      (l) => new Date(l.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000,
    ).length,
    loginsToday: initialLoginLogs.filter((l) => {
      const d = new Date(l.createdAt)
      const now = new Date()
      return d.toDateString() === now.toDateString()
    }).length,
    newUsers7d: initialUsers.filter(
      (u) => new Date(u.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).length,
    unreadClientMessages: 0,
    revenueDelivered30d: 0,
    ordersDelivered30d: 0,
    recentLogins: initialLoginLogs.slice(0, 8).map((l) => ({
      id: l.id,
      pseudo: l.pseudo,
      city: l.city ?? null,
      country: l.country ?? null,
      createdAt: l.createdAt,
    })),
    recentOrders: [...initialActiveOrders, ...initialPastOrders]
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        customerName: t.customerName,
        total: t.total ?? 0,
        status: t.status,
        fulfillment: t.fulfillment,
        updatedAt: t.updatedAt,
      })),
    lockerReminders: { sent: 0, checked: 0 },
    generatedAt: new Date().toISOString(),
  }

  useEffect(() => {
    // Sur petit écran, ouvrir directement les commandes (données déjà hydratées).
    // Ne pas écraser un deep-link ?tab= / thread.
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get("tab") || params.get("thread")) return
      if (sessionStorage.getItem("bb33_admin_tab")) return
      if (window.matchMedia("(max-width: 767px)").matches) {
        setTab("commandes-en-cours")
      }
    } catch {
      /* ignore */
    }
  }, [])

  const refreshBadges = useCallback(async () => {
    try {
      // Timeout mobile : ne jamais bloquer l'UI
      const c = await Promise.race([
        getAdminBadgeCounts(),
        new Promise<null>((r) => setTimeout(() => r(null), 6_000)),
      ])
      if (c) setBadges(c)
    } catch {
      /* silencieux */
    }
  }, [])

  useEffect(() => {
    // Délai court mobile : laisser peindre le panel avant les server actions
    const start = window.setTimeout(() => {
      void refreshBadges()
    }, 400)
    const interval = setInterval(refreshBadges, 15000)
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshBadges()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearTimeout(start)
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [refreshBadges])

  // Deep-link depuis Récupérations → onglet messagerie
  useEffect(() => {
    try {
      const t = sessionStorage.getItem("bb33_admin_tab") as TabId | null
      if (t && TABS.some((x) => x.id === t)) {
        setTab(t)
        sessionStorage.removeItem("bb33_admin_tab")
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Deep-link URL push : /admin?tab=messagerie&thread=123
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get("tab") as TabId | null
      const thread = Number(params.get("thread") || 0)
      if (t && TABS.some((x) => x.id === t)) setTab(t)
      if (Number.isFinite(thread) && thread > 0) setFocusThreadId(thread)
      if (t || thread) {
        window.history.replaceState({}, "", window.location.pathname)
      }
    } catch {
      /* ignore */
    }

    // SW postMessage pour admin
    if (!("serviceWorker" in navigator)) return
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type !== "BB33_DEEP_LINK" || !event.data?.url) return
      try {
        const u = String(event.data.url).startsWith("http")
          ? new URL(String(event.data.url))
          : new URL(String(event.data.url), window.location.origin)
        const t = u.searchParams.get("tab") as TabId | null
        const thr = Number(u.searchParams.get("thread") || 0)
        if (t && TABS.some((x) => x.id === t)) setTab(t)
        if (Number.isFinite(thr) && thr > 0) setFocusThreadId(thr)
      } catch {
        /* ignore */
      }
    }
    navigator.serviceWorker.addEventListener("message", onMsg)
    return () => navigator.serviceWorker.removeEventListener("message", onMsg)
  }, [])

  // Pastille rouge par onglet
  const tabBadge = (id: TabId): number => {
    switch (id) {
      case "commandes-en-cours":
        return badges.orders
      case "locker":
        return badges.locker
      case "messagerie":
        return badges.messaging
      case "verifications":
        return badges.verifications
      case "recuperations":
        return badges.recovery
      default:
        return 0
    }
  }

  const activeTabMeta = TABS.find((t) => t.id === tab)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      <AdminAppBadgeSync total={badges.total} />

      {/* ── Sidebar (desktop) + barre mobile ─────────────────────────────── */}
      <aside className="flex w-full flex-col border-b border-border bg-card md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 py-4 md:px-5 md:py-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/10">
              <Image src="/images/logoapp.png" alt="BB33" fill className="object-cover" sizes="40px" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">BreakingBad33</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Panel Admin
              </p>
            </div>
            {badges.total > 0 && (
              <span className="ml-auto flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white md:hidden">
                {badges.total > 9 ? "9+" : badges.total}
              </span>
            )}
          </div>

          {/* Identité admin */}
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 md:flex">
            <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10">
              <Image src="/images/ww.jpg" alt="" fill className="object-cover object-top" sizes="32px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">Heisenberg</p>
              <p className="text-[10px] text-muted-foreground">Administrateur</p>
            </div>
            {badges.total > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {badges.total > 9 ? "9+" : badges.total}
              </span>
            )}
          </div>

          {/* Nav desktop */}
          <nav className="hidden flex-col gap-0.5 md:flex" aria-label="Sections admin">
            {TABS.map(({ id, label, icon: Icon }) => {
              const count = tabBadge(id)
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {count > 0 && (
                    <span
                      className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                        active ? "bg-accent text-accent-foreground" : "bg-red-500 text-white"
                      }`}
                      aria-label={`${count} non traité${count > 1 ? "s" : ""}`}
                    >
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Actions bas sidebar (desktop) */}
          <div className="mt-auto hidden flex-col gap-3 border-t border-border pt-4 md:flex">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Push vendeur
              </p>
              <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                Alertes commandes / messages, même panel fermé.
              </p>
              <PushToggle role="vendeur" className="w-full" />
            </div>

            <Link
              href="/"
              className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              Vue Client
            </Link>

            <form action={adminLogout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                Déconnexion
              </button>
            </form>
          </div>
        </div>

        {/* Nav mobile — strip horizontal scrollable */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-2 md:hidden">
          {TABS.map(({ id, icon: Icon, label }) => {
            const count = tabBadge(id)
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  active ? "bg-accent/10 text-accent" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            )
          })}
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
            aria-label="Vue Client"
            title="Vue Client"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <form action={adminLogout} className="shrink-0">
            <button
              type="submit"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* ── Contenu principal ─────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-x-hidden">
        {/* Bandeau mobile : titre onglet + push compact */}
        <div className="border-b border-border bg-card/50 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Heisenberg · Admin
              </p>
              <h1 className="text-lg font-bold text-foreground">
                {activeTabMeta?.label ?? "Panel"}
              </h1>
            </div>
            <PushToggle role="vendeur" className="shrink-0" />
          </div>
        </div>

        <div className="p-4 md:p-8">
          {/* Titre desktop de l'onglet courant (sauf dashboard qui a le sien) */}
          {tab !== "dashboard" && (
            <div className="mb-6 hidden md:block">
              <h1 className="text-2xl font-bold text-foreground">
                {activeTabMeta?.label ?? "Panel"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Connecté en tant que Heisenberg
                {badges.total > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
                    {badges.total > 9 ? "9+" : badges.total} en attente
                  </span>
                )}
              </p>
            </div>
          )}

          {tab === "dashboard" ? (
            <AdminDashboard
              onNavigate={(t) => setTab(t as TabId)}
              seed={dashboardSeed}
            />
          ) : tab === "commandes-en-cours" ? (
            <VendorInbox
              initialThreads={initialActiveOrders}
              mode="orders"
              focusThreadId={focusThreadId}
            />
          ) : tab === "locker" ? (
            <VendorInbox
              initialThreads={initialLockerOrders}
              mode="locker"
              focusThreadId={focusThreadId}
            />
          ) : tab === "cloturees" ? (
            <VendorInbox
              initialThreads={initialPastOrders}
              mode="past"
              focusThreadId={focusThreadId}
            />
          ) : tab === "messagerie" ? (
            <VendorInbox
              initialThreads={initialDiscussions}
              mode="messages"
              focusThreadId={focusThreadId}
            />
          ) : tab === "commandes" ? (
            <AdminOrdersRecap threads={initialThreads} />
          ) : tab === "utilisateurs" ? (
            <AdminUsers initialUsers={initialUsers} />
          ) : tab === "verifications" ? (
            <AdminVerifications initialVerifications={initialVerifications} />
          ) : tab === "recuperations" ? (
            <AdminRecovery />
          ) : tab === "notifications" ? (
            <AdminNotifications
              initialHistory={initialNotificationsHistory}
              users={initialUsers}
            />
          ) : tab === "produits" ? (
            <AdminProducts />
          ) : tab === "promos" ? (
            <AdminPromos />
          ) : tab === "fidelite" ? (
            <AdminLoyalty />
          ) : tab === "notations" ? (
            <AdminRatings />
          ) : tab === "carte" ? (
            <AdminMap threads={initialThreads} />
          ) : tab === "logistique" ? (
            <div className="space-y-8">
              <AdminCartSettings />
              <AdminLogistics />
            </div>
          ) : tab === "crypto" ? (
            <AdminCryptoSettings />
          ) : tab === "news" ? (
            <AdminNews />
          ) : tab === "connexions" ? (
            <AdminLoginLogs initialLogs={initialLoginLogs} />
          ) : tab === "profits" ? (
            <AdminProfit initialData={initialProfitData} />
          ) : tab === "staff" ? (
            <AdminStaff initialStaff={initialStaff} />
          ) : tab === "admins" ? (
            <AdminAdmins />
          ) : null}
        </div>
      </main>
    </div>
  )
}
