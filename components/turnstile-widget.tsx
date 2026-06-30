"use client"

import { useEffect, useRef } from "react"

// Widget Cloudflare Turnstile. Appelle onVerify(token) quand le challenge réussit.
// Si la clé site n'est pas configurée, le widget ne s'affiche pas (fail-open en dev).
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit"

export function TurnstileWidget({
  onVerify,
  className,
  resetSignal,
}: {
  onVerify: (token: string) => void
  className?: string
  // Incrémenter cette valeur réinitialise le widget (token à usage unique).
  resetSignal?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // Réinitialise le widget après un échec ou une soumission consommée.
  useEffect(() => {
    if (resetSignal === undefined) return
    if (widgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current)
        onVerify("")
      } catch {
        // ignore
      }
    }
  }, [resetSignal, onVerify])

  useEffect(() => {
    if (!siteKey || !ref.current) return

    const render = () => {
      if (!window.turnstile || !ref.current) return
      // Évite un double rendu.
      if (widgetId.current) return
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => onVerify(token),
        "expired-callback": () => onVerify(""),
        "error-callback": () => onVerify(""),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      window.onTurnstileLoad = render
      if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
        const script = document.createElement("script")
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          // ignore
        }
        widgetId.current = null
      }
    }
  }, [siteKey, onVerify])

  // Sans clé configurée, rien à afficher (la vérif serveur fait fail-open).
  if (!siteKey) return null

  return <div ref={ref} className={className} />
}
