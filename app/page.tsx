"use client"

import { useState } from "react"
import { CartProvider } from "@/components/cart-provider"
import { Navbar } from "@/components/navbar"
import { LoginPage } from "@/components/login-page"
import { UserDashboardModal } from "@/components/user-dashboard-modal"
import { LoyaltyModal } from "@/components/loyalty-modal"
import { MyOrdersModal } from "@/components/my-orders-modal"
import { DeliveryInfoModal } from "@/components/delivery-info-modal"
import { CheckoutCart } from "@/components/checkout-cart"
import { Hero } from "@/components/hero"
import { FeaturedProducts } from "@/components/featured-products"
import { NewArrivals } from "@/components/new-arrivals"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false)
  const [isOrdersOpen, setIsOrdersOpen] = useState(false)
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userData, setUserData] = useState<{ pseudo?: string } | null>(null)

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
    const pseudo = localStorage.getItem("userPseudo")
    if (pseudo) setUserData({ pseudo })
    setIsAdmin(localStorage.getItem("isAdmin") === "1")
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
      <Navbar
        isLoggedIn={isAuthenticated}
        onLogout={handleLogout}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenLoyalty={() => setIsLoyaltyOpen(true)}
        onOpenOrders={() => setIsOrdersOpen(true)}
        onOpenDelivery={() => setIsDeliveryOpen(true)}
        isAdmin={isAdmin}
      />

      <main>
        {!isAuthenticated ? (
          <LoginPage onSuccess={handleLoginSuccess} />
        ) : (
          <div className="bg-background text-foreground">
            <Hero />
            <FeaturedProducts />
            <NewArrivals />
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

      {isAuthenticated && <CheckoutCart userData={userData} />}
    </CartProvider>
  )
}
