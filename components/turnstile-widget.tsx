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
  onError,
  className,
  resetSignal,
}: {
  onVerify: (token: string) => void
  onError?: () => void
  className?: string
  resetSignal?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // Stocker les callbacks dans des refs pour éviter que leur recréation
  // à chaque render parent ne re-déclenche le useEffect du widget.
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)
  useEffect(() => { onVerifyRef.current = onVerify }, [onVerify])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Réinitialise le widget après un échec ou une soumission consommée.
  useEffect(() => {
    if (resetSignal === undefined) return
    if (widgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current)
        onVerifyRef.current("")
      } catch {
        // ignore
      }
    }
  }, [resetSignal])

  useEffect(() => {
    if (!siteKey || !ref.current) return

    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      onErrorRef.current?.()
    }

    const render = () => {
      if (!window.turnstile || !ref.current) return
      // Évite un double rendu si le widget est déjà monté.
      if (widgetId.current) return
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => {
          settled = true
          onVerifyRef.current(token)
        },
        "expired-callback": () => onVerifyRef.current(""),
        "error-callback": () => fail(),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      // Un seul listener global — on écrase proprement sans empilement.
      window.onTurnstileLoad = render
      if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
        const script = document.createElement("script")
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.onerror = () => fail()
        document.head.appendChild(script)
      }
    }

    // Filet de sécurité : 8 s sans résultat = widget indisponible.
    const timeout = window.setTimeout(fail, 8000)

    return () => {
      window.clearTimeout(timeout)
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          // ignore
        }
        widgetId.current = null
      }
    }
    // siteKey est une constante env — on ne la met pas en dép pour éviter
    // les re-mounts. onVerify/onError sont gérés via refs ci-dessus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  if (!siteKey) return null

  return <div ref={ref} className={className} />
}
