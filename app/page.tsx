"use client"

import { useState, useEffect, useCallback } from "react"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { getUnreadCounts } from "@/app/actions/messaging"
import { getAccount } from "@/app/actions/account"
import { resolveClientLogin } from "@/app/actions/staff"
import { CartProvider } from "@/components/cart-provider"
import { NotificationsProvider } from "@/components/notifications-provider"
import { Navbar } from "@/components/navbar"
import { LoginPage } from "@/components/login-page"
import { UserDashboardModal } from "@/components/user-dashboard-modal"
import { LoyaltyModal } from "@/components/loyalty-modal"
import { MyOrdersModal } from "@/components/my-orders-modal"
import { MessagerieModal } from "@/components/messagerie-modal"
import { NewsPopup } from "@/components/news-popup"
import { DeliveryInfoModal } from "@/components/delivery-info-modal"
import { HowItWorksModal } from "@/components/how-it-works-modal"
import { CheckoutCart } from "@/components/checkout-cart"
import { Hero } from "@/components/hero"
import { ShopSections } from "@/components/shop-sections"
import { RecoveryBanner } from "@/components/recovery-banner"
import { AppBadgeSync } from "@/components/app-badge-sync"
import { InstallAppPrompt } from "@/components/install-app-prompt"
import { setAppBadgeCount } from "@/lib/app-badge"
import type { OrderNotification } from "@/components/notifications-provider"
import type { ClientOpenSection } from "@/lib/deep-links"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false)
  const [isOrdersOpen, setIsOrdersOpen] = useState(false)
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false)
  const [isMessagingOpen, setIsMessagingOpen] = useState(false)
  const [autoOpenLatestMessaging, setAutoOpenLatestMessaging] = useState(false)
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userData, setUserData] = useState<{ pseudo?: string; token?: string } | null>(null)
  const [unreadMessaging, setUnreadMessaging] = useState(0)
  const [unreadOrders, setUnreadOrders] = useState(0)
  // Deep-link depuis push / cloche → fil précis
  const [focusThreadId, setFocusThreadId] = useState<number | null>(null)
  const [focusOrdersTab, setFocusOrdersTab] = useState<"active" | "locker" | "past" | null>(null)

  const refreshUnread = useCallback(async (token?: string) => {
    if (!token) return
    try {
      const counts = await getUnreadCounts(token)
      setUnreadMessaging(counts.messaging)
      setUnreadOrders(counts.orders)
    } catch {
      // silencieux
    }
  }, [])

  // Poll toutes les 12s + au retour focus (client connecté non-admin)
  useEffect(() => {
    const token = userData?.token
    if (!token || isAdmin) {
      if (isAdmin) void setAppBadgeCount(0) // badge client non applicable ici
      return
    }
    refreshUnread(token)
    const interval = setInterval(() => refreshUnread(token), 12000)
    const onVis = () => {
      if (document.visibilityState === "visible") refreshUnread(token)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [userData?.token, isAdmin, refreshUnread])

  const applyClientDeepLink = useCallback((rawUrl: string) => {
    try {
      const u = rawUrl.startsWith("http")
        ? new URL(rawUrl)
        : new URL(rawUrl, window.location.origin)
      const open = (u.searchParams.get("open") || "") as ClientOpenSection | ""
      const thread = Number(u.searchParams.get("thread") || 0)
      const tid = Number.isFinite(thread) && thread > 0 ? thread : null

      if (open === "messaging") {
        if (tid) setFocusThreadId(tid)
        setIsMessagingOpen(true)
        setIsOrdersOpen(false)
      } else if (open === "orders" || open === "locker") {
        if (tid) setFocusThreadId(tid)
        setFocusOrdersTab(open === "locker" ? "locker" : "active")
        setIsOrdersOpen(true)
        setIsMessagingOpen(false)
      } else if (tid) {
        // thread seul → messagerie par défaut (annonces)
        setFocusThreadId(tid)
        setIsMessagingOpen(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Service worker → resync badges + deep-link au clic push
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === "BB33_REFRESH_BADGES") {
        const token = localStorage.getItem("authToken")
        if (token && localStorage.getItem("isAdmin") !== "1") {
          void refreshUnread(token)
        }
      }
      if (event.data?.type === "BB33_DEEP_LINK" && event.data?.url) {
        applyClientDeepLink(String(event.data.url))
      }
    }
    navigator.serviceWorker.addEventListener("message", onMsg)
    return () => navigator.serviceWorker.removeEventListener("message", onMsg)
  }, [refreshUnread, applyClientDeepLink])

  const handleOpenNotification = useCallback((n: OrderNotification) => {
    setFocusThreadId(n.threadId)
    if (n.openTarget === "messaging") {
      setIsMessagingOpen(true)
      setIsOrdersOpen(false)
    } else {
      setFocusOrdersTab(n.openTarget === "locker" ? "locker" : n.kind === "trk" ? "active" : "active")
      setIsOrdersOpen(true)
      setIsMessagingOpen(false)
    }
  }, [])

  // Au montage, on restaure la session pour éviter de retomber sur l'écran de
  // connexion lors d'un rechargement de la même session navigateur.
  useEffect(() => {
    let cancelled = false

    // Sécurité fermeture navigateur :
    // sessionStorage est vidé par le navigateur quand tous les onglets du site
    // sont fermés. S'il n'y a pas de marqueur "bb33_session_alive", c'est que le
    // navigateur vient d'être rouvert → on purge localStorage pour forcer la
    // reconnexion. On pose ensuite le marqueur pour les rechargements dans la
    // même session.
    const sessionAlive = sessionStorage.getItem("bb33_session_alive")
    if (!sessionAlive) {
      // Session fermée : on force la reconnexion (clé ou biométrie).
      // On conserve volontairement bb33_webauthn / bb33_webauthn_ids pour le déverrouillage rapide.
      localStorage.removeItem("authToken")
      localStorage.removeItem("userPseudo")
      localStorage.removeItem("isAdmin")
      void setAppBadgeCount(0)
    }
    sessionStorage.setItem("bb33_session_alive", "1")

    // 1) Session locale (client OU admin connecté via la page de connexion)
    const token = localStorage.getItem("authToken")
    const isAdminLocal = localStorage.getItem("isAdmin") === "1"
    if (token) {
      // Les admins n'ont pas de ligne en base — on vérifie uniquement les clients.
      if (!isAdminLocal) {
        // resolveClientLogin : répare whitelist + pseudo + rattache les conversations
        resolveClientLogin(token)
          .then((resolved) => {
            if (cancelled) return
            if (!resolved.ok) {
              localStorage.removeItem("authToken")
              localStorage.removeItem("userPseudo")
              localStorage.removeItem("isAdmin")
              setIsAuthenticated(false)
              setUserData(null)
              return
            }
            localStorage.setItem("authToken", resolved.token)
            localStorage.setItem("userPseudo", resolved.pseudo)
            setIsAuthenticated(true)
            setIsAdmin(false)
            setUserData({ pseudo: resolved.pseudo, token: resolved.token })
          })
          .catch(() => {
            // Repli : getAccount simple
            getAccount(token)
              .then((account) => {
                if (cancelled) return
                if (!account) {
                  localStorage.removeItem("authToken")
                  localStorage.removeItem("userPseudo")
                  setIsAuthenticated(false)
                  setUserData(null)
                  return
                }
                setIsAuthenticated(true)
                setIsAdmin(false)
                setUserData({ pseudo: account.pseudo ?? undefined, token })
              })
              .catch(() => {
                setIsAuthenticated(true)
                setIsAdmin(false)
                setUserData({
                  pseudo: localStorage.getItem("userPseudo") ?? undefined,
                  token,
                })
              })
          })
        return
      }
      setIsAuthenticated(true)
      setIsAdmin(true)
      setUserData({
        pseudo: localStorage.getItem("userPseudo") ?? undefined,
        token,
      })
      return
    }

    // 2) Sinon, session admin par cookie serveur (ex. "Voir le site" depuis le
    //    panel admin quand l'authentification s'est faite via le portail /admin).
    isAdminAuthenticated()
      .then((ok) => {
        if (cancelled || !ok) return
        setIsAuthenticated(true)
        setIsAdmin(true)
        setUserData({ pseudo: "Heisenberg" })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleLoginSuccess = (opts?: { openOrders?: boolean; openMessaging?: boolean; openLatestMessaging?: boolean; openKyc?: boolean }) => {
    setIsAuthenticated(true)
    const pseudo = localStorage.getItem("userPseudo") ?? undefined
    const token = localStorage.getItem("authToken") ?? undefined
    setUserData({ pseudo, token })
    setIsAdmin(localStorage.getItem("isAdmin") === "1")
    if (opts?.openOrders) setIsOrdersOpen(true)
    if (opts?.openMessaging) setIsMessagingOpen(true)
    if (opts?.openLatestMessaging) {
      setAutoOpenLatestMessaging(true)
      setIsMessagingOpen(true)
    }
    if (opts?.openKyc) {
      window.location.href = "/verification?from=recovery"
    }
  }

  // Deep-link messagerie après KYC récupération (?open=messaging)
  // Deep-link URL au chargement (?open=messaging&thread=…)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (!params.get("open") && !params.get("thread")) return
    const token = localStorage.getItem("authToken")
    const pseudo = localStorage.getItem("userPseudo")
    if (token && pseudo && localStorage.getItem("isAdmin") !== "1") {
      setIsAuthenticated(true)
      setUserData({ token, pseudo })
    }
    applyClientDeepLink(window.location.href)
    window.history.replaceState({}, "", window.location.pathname)
  }, [applyClientDeepLink])

  const handleLogout = async () => {
    const token = userData?.token ?? (typeof window !== "undefined" ? localStorage.getItem("authToken") : null)
    const adminLocal =
      isAdmin || (typeof window !== "undefined" && localStorage.getItem("isAdmin") === "1")
    // Journal soft : timeout court pour ne jamais bloquer la déconnexion UI.
    if (token && !adminLocal) {
      try {
        const { recordLogout } = await import("@/app/actions/login-logs")
        await Promise.race([
          recordLogout(token),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ])
      } catch {
        /* soft — on purgera la session quand même */
      }
    }
    setIsAuthenticated(false)
    setIsDashboardOpen(false)
    setIsAdmin(false)
    setUserData(null)
    setUnreadMessaging(0)
    setUnreadOrders(0)
    void setAppBadgeCount(0)
    localStorage.removeItem("authToken")
    localStorage.removeItem("userPseudo")
    localStorage.removeItem("isAdmin")
  }

  return (
    <CartProvider>
      <NotificationsProvider
        pseudo={userData?.pseudo}
        token={userData?.token}
        enabled={isAuthenticated && !isAdmin}
      >
      <AppBadgeSync
        menuUnread={unreadMessaging + unreadOrders}
        enabled={isAuthenticated && !isAdmin}
      />
      <Navbar
        isLoggedIn={isAuthenticated}
        onLogout={handleLogout}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenLoyalty={() => setIsLoyaltyOpen(true)}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onOpenDelivery={() => setIsDeliveryOpen(true)}
        onOpenMessaging={() => setIsMessagingOpen(true)}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
        isAdmin={isAdmin}
        unreadMessaging={unreadMessaging}
        unreadOrders={unreadOrders}
        onOpenNotification={handleOpenNotification}
      />

      <main>
        {!isAuthenticated ? (
          <LoginPage onSuccess={handleLoginSuccess} />
        ) : (
          <div className="bg-background text-foreground">
            {!isAdmin && (
              <RecoveryBanner
                token={userData?.token}
                onOpenMessaging={() => setIsMessagingOpen(true)}
              />
            )}
            <Hero />
            <ShopSections />
          </div>
        )}
      </main>

      <UserDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        userData={userData}
        onLogout={handleLogout}
      />

      <LoyaltyModal isOpen={isLoyaltyOpen} onClose={() => setIsLoyaltyOpen(false)} userData={userData} />

      <MyOrdersModal
        isOpen={isOrdersOpen}
        onClose={() => {
          setIsOrdersOpen(false)
          setFocusThreadId(null)
          setFocusOrdersTab(null)
          if (userData?.token) refreshUnread(userData.token)
        }}
        userData={userData}
        focusThreadId={isOrdersOpen ? focusThreadId : null}
        focusTab={focusOrdersTab}
        onFocusConsumed={() => {
          // Important : consommer le deep-link une seule fois.
          // Sinon le polling (threads) ré-ouvre le fil notif et "éjecte" le client
          // du fil où il écoute un vocal.
          setFocusThreadId(null)
          setFocusOrdersTab(null)
        }}
      />

      <DeliveryInfoModal isOpen={isDeliveryOpen} onClose={() => setIsDeliveryOpen(false)} />

      <HowItWorksModal isOpen={isHowItWorksOpen} onClose={() => setIsHowItWorksOpen(false)} />

      <MessagerieModal
        isOpen={isMessagingOpen}
        onClose={() => {
          setIsMessagingOpen(false)
          setAutoOpenLatestMessaging(false)
          setFocusThreadId(null)
          if (userData?.token) refreshUnread(userData.token)
        }}
        userData={userData}
        autoOpenLatest={autoOpenLatestMessaging}
        focusThreadId={isMessagingOpen ? focusThreadId : null}
        onFocusConsumed={() => {
          setFocusThreadId(null)
        }}
      />

      {/* Popup News à l'entrée du site (client connecté non admin) */}
      {isAuthenticated && !isAdmin && <NewsPopup token={userData?.token} />}

      {isAuthenticated && <CheckoutCart userData={userData} />}

      {/* Proposition d'install PWA — visiteurs navigateur uniquement */}
      {!isAdmin && <InstallAppPrompt enabled />}

      </NotificationsProvider>
    </CartProvider>
  )
}
