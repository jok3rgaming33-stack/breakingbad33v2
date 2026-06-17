"use client"

import { Bell, BellOff, BellRing } from "lucide-react"
import { usePushNotifications } from "@/hooks/use-push-notifications"

// Bouton d'activation des notifications push (client ou vendeur).
// S'adapte selon le support du navigateur et l'état d'abonnement.
export function PushToggle({
  role,
  customerToken,
  className = "",
}: {
  role: "client" | "vendeur"
  customerToken?: string | null
  className?: string
}) {
  const { supported, subscribed, permission, busy, subscribe, unsubscribe } = usePushNotifications({
    role,
    customerToken,
  })

  if (!supported) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        Les notifications push ne sont pas disponibles sur ce navigateur. Sur iPhone, ajoute le site à
        l&apos;écran d&apos;accueil pour les activer.
      </p>
    )
  }

  if (permission === "denied") {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        Notifications bloquées. Autorise-les dans les réglages de ton navigateur pour être averti.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={() => (subscribed ? unsubscribe() : subscribe())}
      disabled={busy}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        subscribed
          ? "border-[#3e6757]/40 bg-[#3e6757]/15 text-[#7fd1b0] hover:bg-[#3e6757]/25"
          : "border-input bg-secondary text-foreground hover:bg-secondary/80"
      } ${className}`}
    >
      {busy ? (
        <Bell className="h-4 w-4 animate-pulse" />
      ) : subscribed ? (
        <BellRing className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {busy
        ? "Patiente…"
        : subscribed
          ? "Notifications activées"
          : "Activer les notifications"}
    </button>
  )
}
