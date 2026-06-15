"use client"

import { useState } from "react"
import { CartProvider } from "@/components/cart-provider"
import { Navbar } from "@/components/navbar"
import { LoginPage } from "@/components/login-page"
import { UserDashboardModal } from "@/components/user-dashboard-modal"
import { Hero } from "@/components/hero"
import { FeaturedProducts } from "@/components/featured-products"
import { NewArrivals } from "@/components/new-arrivals"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)
  const [userData, setUserData] = useState<{ pseudo?: string } | null>(null)

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
    const pseudo = localStorage.getItem("userPseudo")
    if (pseudo) setUserData({ pseudo })
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setIsDashboardOpen(false)
    setUserData(null)
    localStorage.removeItem("authToken")
    localStorage.removeItem("userPseudo")
  }

  return (
    <CartProvider>
      <Navbar
        isLoggedIn={isAuthenticated}
        onLogout={handleLogout}
        onOpenDashboard={() => setIsDashboardOpen(true)}
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
    </CartProvider>
  )
}
