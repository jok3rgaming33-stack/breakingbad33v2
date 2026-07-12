"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Page de déconnexion globale.
 * Appelée après que la server action adminLogout() a supprimé le cookie admin_session.
 * Nettoie le localStorage (session client) puis redirige vers l'accueil.
 */
export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    // Nettoyage complet de la session client
    localStorage.removeItem("authToken")
    localStorage.removeItem("userPseudo")
    localStorage.removeItem("isAdmin")
    // Retour à l'accueil
    router.replace("/")
  }, [router])

  return null
}
