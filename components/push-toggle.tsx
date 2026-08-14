"use client"

import { Bell, BellOff, BellRing } from "lucide-react"
import { usePushNotifications } from "@/hooks/use-push-notifications"

// Bouton d'activation des notifications push (client ou vendeur).
// S'adapte selon le support du navigateur et l'état d'abonnement.
export function PushToggle({
  role,
  customerToken,
  className = "",
  compact = false,
}: {
  role: "client" | "vendeur"
  customerToken?: string | null
  className?: string
  /** Bouton icône seul (header mobile admin). */
  compact?: boolean
}) {
  const { supported, subscribed, permission, busy, subscribe, unsubscribe } = usePushNotifications({
    role,
    customerToken,
  })

  if (!supported) {
    if (compact) return null
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <p className="text-xs font-semibold text-muted-foreground">Notifications push</p>
        <p className="text-xs text-muted-foreground">
          Non disponibles sur ce navigateur.{" "}
          <span className="font-medium text-foreground">
            Sur iPhone : ajoute le site à l&apos;écran d&apos;accueil
          </span>{" "}
          (Safari → icône Partager → «&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;») puis réactive depuis la cloche.
        </p>
      </div>
    )
  }

  if (permission === "denied") {
    if (compact) {
      return (
        <button
          type="button"
          disabled
          title="Notifications bloquées dans le navigateur"
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/30 text-destructive ${className}`}
        >
          <BellOff className="h-4 w-4" aria-hidden="true" />
        </button>
      )
    }
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <p className="text-xs font-semibold text-destructive">Notifications bloquées</p>
        <p className="text-xs text-muted-foreground">
          Autorise-les dans les réglages de ton navigateur (Site info → Notifications → Autoriser) puis recharge la page.
        </p>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => (subscribed ? unsubscribe() : subscribe())}
        disabled={busy}
        title={subscribed ? "Notifications activées — cliquer pour couper" : "Activer les notifications"}
        aria-label={subscribed ? "Notifications activées" : "Activer les notifications"}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${
          subscribed
            ? "border-[#3e6757]/40 bg-[#3e6757]/15 text-[#7fd1b0]"
            : "border-input bg-secondary text-foreground"
        } ${className}`}
      >
        {busy ? (
          <Bell className="h-4 w-4 animate-pulse" aria-hidden="true" />
        ) : subscribed ? (
          <BellRing className="h-4 w-4" aria-hidden="true" />
        ) : (
          <BellOff className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    )
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => (subscribed ? unsubscribe() : subscribe())}
        disabled={busy}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
          subscribed
            ? "border-[#3e6757]/40 bg-[#3e6757]/15 text-[#7fd1b0] hover:bg-[#3e6757]/25"
            : "border-input bg-secondary text-foreground hover:bg-secondary/80"
        }`}
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
      <p className="text-center text-[11px] text-muted-foreground">
        {subscribed
          ? "Tu recevras les mises à jour de commande et les messages même site fermé."
          : "Reçois les mises à jour de commande et messages en temps réel, même quand le site est fermé."}
      </p>
    </div>
  )
}
