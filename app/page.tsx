"use client"

import { useState } from "react"
import { CartProvider } from "@/components/cart-provider"
import { Navbar } from "@/components/navbar"
import { LoginPage } from "@/components/login-page"
import { UserDashboardModal } from "@/components/user-dashboard-modal"

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
          <div className="flex min-h-screen items-center justify-center bg-background pt-16 text-foreground">
            <div className="text-center">
              <h1 className="mb-4 text-4xl font-bold text-balance">Bienvenue sur BreakingBad33</h1>
              <button
                onClick={() => setIsDashboardOpen(true)}
                className="rounded-2xl bg-accent px-8 py-3 font-semibold text-accent-foreground transition-colors hover:brightness-110"
              >
                Ouvrir mon Dashboard
              </button>
            </div>
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
