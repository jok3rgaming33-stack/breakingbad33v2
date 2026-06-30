"use client"

import { useState, useEffect } from "react"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
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
import { CheckoutCart } from "@/components/checkout-cart"
import { Hero } from "@/components/hero"
import { ShopSections } from "@/components/shop-sections"
import { ViewSwitcher } from "@/components/view-switcher"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false)
  const [isOrdersOpen, setIsOrdersOpen] = useState(false)
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false)
  const [isMessagingOpen, setIsMessagingOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userData, setUserData] = useState<{ pseudo?: string; token?: string } | null>(null)

  // Au montage, on restaure la session pour éviter de retomber sur l'écran de
  // connexion lors d'un rechargement ou d'un nouvel onglet ("Voir le site").
  useEffect(() => {
    let cancelled = false

    // 1) Session locale (client OU admin connecté via la page de connexion)
    const token = localStorage.getItem("authToken")
    if (token) {
      setIsAuthenticated(true)
      setIsAdmin(localStorage.getItem("isAdmin") === "1")
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

  const handleLoginSuccess = (opts?: { openOrders?: boolean }) => {
    setIsAuthenticated(true)
    const pseudo = localStorage.getItem("userPseudo") ?? undefined
    const token = localStorage.getItem("authToken") ?? undefined
    setUserData({ pseudo, token })
    setIsAdmin(localStorage.getItem("isAdmin") === "1")
    if (opts?.openOrders) setIsOrdersOpen(true)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setIsDashboardOpen(false)
    setIsAdmin(false)
    setUserData(null)
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
      <Navbar
        isLoggedIn={isAuthenticated}
        onLogout={handleLogout}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenLoyalty={() => setIsLoyaltyOpen(true)}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onOpenDelivery={() => setIsDeliveryOpen(true)}
        onOpenMessaging={() => setIsMessagingOpen(true)}
        isAdmin={isAdmin}
      />

      <main>
        {!isAuthenticated ? (
          <LoginPage onSuccess={handleLoginSuccess} />
        ) : (
          <div className="bg-background text-foreground">
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

      <MyOrdersModal isOpen={isOrdersOpen} onClose={() => setIsOrdersOpen(false)} userData={userData} />

      <DeliveryInfoModal isOpen={isDeliveryOpen} onClose={() => setIsDeliveryOpen(false)} />

      <MessagerieModal isOpen={isMessagingOpen} onClose={() => setIsMessagingOpen(false)} userData={userData} />

      {/* Popup News à l'entrée du site (client connecté non admin) */}
      {isAuthenticated && !isAdmin && <NewsPopup token={userData?.token} />}

      {isAuthenticated && <CheckoutCart userData={userData} />}

      {/* Bascule discrète Vue Client / Panel Admin (admin uniquement) */}
      {isAuthenticated && isAdmin && <ViewSwitcher current="client" />}
      </NotificationsProvider>
    </CartProvider>
  )
}
