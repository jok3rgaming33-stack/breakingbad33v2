"use client"

import { useEffect, useState } from "react"
import { Share, Smartphone, PlusSquare, X, Check } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isStandalone() {
  if (typeof window === "undefined") return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

function isIos() {
  if (typeof window === "undefined") return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

/**
 * Bouton « Ajouter à l'écran d'accueil » pour le mode tournée.
 * Android/Chrome : prompt natif. iOS : tutoriel Partager → Sur l'écran d'accueil.
 */
export function AddToHomeScreen({ startPath = "/run" }: { startPath?: string }) {
  const [installed, setInstalled] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosOpen, setIosOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true)
      return
    }

    const linkId = "bb33-run-manifest"
    let link = document.getElementById(linkId) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement("link")
      link.id = linkId
      link.rel = "manifest"
      document.head.appendChild(link)
    }
    link.href = `/run/manifest.webmanifest?start=${encodeURIComponent(startPath)}`

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    const onInstalled = () => setInstalled(true)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [startPath])

  if (installed) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-emerald-400/90">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Raccourci écran d&apos;accueil actif
      </p>
    )
  }

  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === "accepted") setInstalled(true)
      setDeferred(null)
      return
    }
    if (isIos()) {
      setIosOpen(true)
      return
    }
    setHint("Sur Android : menu ⋮ du navigateur → « Ajouter à l'écran d'accueil ».")
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 hover:bg-accent/10"
      >
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        Ajouter à l&apos;écran d&apos;accueil
      </button>
      {hint && <p className="max-w-xs text-center text-[11px] text-muted-foreground">{hint}</p>}

      {iosOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setIosOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold">Épingler Tournée</h2>
              <button
                type="button"
                onClick={() => setIosOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Share className="h-4 w-4" />
                </span>
                <span>
                  Appuie sur <strong className="text-foreground">Partager</strong> (carré + flèche) en bas de Safari.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <PlusSquare className="h-4 w-4" />
                </span>
                <span>
                  Choisis <strong className="text-foreground">Sur l&apos;écran d&apos;accueil</strong>, puis Ajouter.
                </span>
              </li>
            </ol>
            <p className="mt-4 text-[11px] text-muted-foreground">
              L&apos;icône « Tournée » ouvre directement cette page — plus besoin du panel.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
