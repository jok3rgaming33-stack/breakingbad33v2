"use client"

import { useEffect, useState } from "react"
import { usePushNotifications } from "@/hooks/use-push-notifications"

/**
 * Garde l'abonnement push vivant tant que le client est sur le site.
 * La cloche ne montait le hook que lorsque le menu était ouvert : un
 * abonnement expiré n'était jamais recréé.
 */
export function PushKeeper({ role }: { role: "client" | "vendeur" }) {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    try {
      setToken(localStorage.getItem("authToken"))
    } catch {
      setToken(null)
    }
  }, [])

  usePushNotifications({
    role,
    // Côté vendeur on ne passe pas le token admin (il écraserait le compte client
    // du même appareil). null = on conserve le token client déjà enregistré.
    customerToken: role === "client" ? token : null,
  })

  return null
}
