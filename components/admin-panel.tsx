"use client"

import { useState } from "react"
import type { OrderThread } from "@/lib/db/schema"
import type { AdminUserRow } from "@/app/actions/account"
import type { VerificationRow } from "@/app/actions/verification"
import { VendorInbox } from "@/components/vendor-inbox"
import { AdminOrdersRecap } from "@/components/admin-orders-recap"
import { AdminUsers } from "@/components/admin-users"
import { AdminVerifications } from "@/components/admin-verifications"
import { AdminAdmins } from "@/components/admin-admins"
import { AdminMap } from "@/components/admin-map"
import { AdminNews } from "@/components/admin-news"
import { AdminProducts } from "@/components/admin-products"
import { AdminPromos } from "@/components/admin-promos"
import { AdminLogistics } from "@/components/admin-logistics"
import { AdminCartSettings } from "@/components/admin-cart-settings"
import { AdminLoginLogs } from "@/components/admin-login-logs"
import type { LoginLogRow } from "@/app/actions/login-logs"
import { AdminProfit } from "@/components/admin-profit"
import type { ProfitSummary } from "@/app/actions/profit"
import { AdminNotifications } from "@/components/admin-notifications"
import type { BroadcastNotificationRow } from "@/app/actions/notifications"
import { adminLogout } from "@/app/actions/admin-auth"
import { MessageSquare, Map, ListOrdered, Users, TrendingUp, LogOut, Construction, Eye, Newspaper, Package, Ticket, ShieldCheck, UserCog, Truck, Inbox, Activity, Bell, CheckCheck } from "lucide-react"
import Link from "next/link"
import { PushToggle } from "@/components/push-toggle"

type TabId = "commandes-en-cours" | "locker" | "cloturees" | "messagerie" | "carte" | "commandes" | "utilisateurs" | "verifications" | "produits" | "promos" | "logistique" | "news" | "admins" | "profits" | "connexions" | "notifications"

const TABS: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: "commandes-en-cours", label: "Commandes en cours", icon: Inbox },
  { id: "locker", label: "Locker MR", icon: Package },
  { id: "cloturees", label: "Clôturées", icon: CheckCheck },
  { id: "messagerie", label: "Messagerie", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "produits", label: "Produits", icon: Package },
  { id: "promos", label: "Codes promo", icon: Ticket },
  { id: "carte", label: "Carte interactive", icon: Map },
  { id: "logistique", label: "Logistique", icon: Truck },
  { id: "commandes", label: "Récap commandes", icon: ListOrdered },
  { id: "utilisateurs", label: "Utilisateurs", icon: Users },
  { id: "verifications", label: "Vérifications", icon: ShieldCheck },
  { id: "connexions", label: "Connexions", icon: Activity },
  { id: "news", label: "News", icon: Newspaper },
  { id: "admins", label: "Admins", icon: UserCog },
  { id: "profits", label: "Profits", icon: TrendingUp },
]

const COMING_SOON: Record<"profits", { title: string; desc: string }> = {
  profits: { title: "Récapitulatif des profits", desc: "Suivi des revenus, marges et statistiques de vente. En cours de développement." },
}

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
}) {
  const [tab, setTab] = useState<TabId>("commandes-en-cours")

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold">Panel Administrateur</h1>
            <p className="text-xs text-muted-foreground">Connecté en tant que Heisenberg</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Vue Client
            </Link>
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
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Activation des notifications push vendeur (nouvelles commandes + messages clients) */}
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:max-w-md">
          <p className="text-sm font-medium">Notifications vendeur</p>
          <p className="text-xs text-muted-foreground">
            Sois alerté des nouvelles commandes et des nouveaux messages clients, même panel fermé.
          </p>
          <PushToggle role="vendeur" className="mt-1" />
        </div>

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
        {tab === "commandes-en-cours" ? (
          <VendorInbox initialThreads={initialActiveOrders} mode="orders" />
        ) : tab === "locker" ? (
          <VendorInbox initialThreads={initialLockerOrders} mode="locker" />
        ) : tab === "cloturees" ? (
          <VendorInbox initialThreads={initialPastOrders} mode="past" />
        ) : tab === "messagerie" ? (
          <VendorInbox initialThreads={initialDiscussions} mode="messages" />
        ) : tab === "commandes" ? (
          <AdminOrdersRecap threads={initialThreads} />
        ) : tab === "utilisateurs" ? (
          <AdminUsers initialUsers={initialUsers} />
        ) : tab === "verifications" ? (
          <AdminVerifications initialVerifications={initialVerifications} />
        ) : tab === "notifications" ? (
          <AdminNotifications initialHistory={initialNotificationsHistory} users={initialUsers} />
        ) : tab === "produits" ? (
          <AdminProducts />
        ) : tab === "promos" ? (
          <AdminPromos />
        ) : tab === "carte" ? (
          <AdminMap threads={initialThreads} />
        ) : tab === "logistique" ? (
          <div className="space-y-8">
            <AdminCartSettings />
            <AdminLogistics />
          </div>
        ) : tab === "news" ? (
          <AdminNews />
        ) : tab === "connexions" ? (
          <AdminLoginLogs initialLogs={initialLoginLogs} />
        ) : tab === "profits" ? (
          <AdminProfit initialData={initialProfitData} />
        ) : tab === "admins" ? (
          <AdminAdmins />
        ) : null}
      </div>
    </div>
  )
}
