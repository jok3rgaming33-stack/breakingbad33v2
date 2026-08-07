"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { recordLogout } from "@/app/actions/login-logs"

/**
 * Page de déconnexion globale.
 * Appelée après que la server action adminLogout() a supprimé le cookie admin_session.
 * Nettoie le localStorage (session client) puis redirige vers l'accueil.
 */
export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = localStorage.getItem("authToken")
      const isAdminLocal = localStorage.getItem("isAdmin") === "1"
      if (token && !isAdminLocal) {
        try {
          await recordLogout(token)
        } catch {
          /* soft */
        }
      }
      if (cancelled) return
      // Nettoyage session client — on garde bb33_webauthn* pour le déverrouillage rapide
      localStorage.removeItem("authToken")
      localStorage.removeItem("userPseudo")
      localStorage.removeItem("isAdmin")
      router.replace("/")
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
