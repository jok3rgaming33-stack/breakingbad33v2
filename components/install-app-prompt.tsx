"use client"

import { useEffect, useState } from "react"
import { Download, Share, PlusSquare, Smartphone, X } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const STORAGE_KEY = "bb33_install_prompt_dismissed_at"
const DISMISS_DAYS = 14
const SHOW_DELAY_MS = 9000

function isStandalone() {
  if (typeof window === "undefined") return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

function isIos() {
  if (typeof window === "undefined") return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_DAYS * 86400000
  } catch {
    return false
  }
}

function markDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/**
 * Toast in-app proposant d'installer la PWA (visiteurs navigateur uniquement).
 * Android/Chrome : beforeinstallprompt. iOS : tutoriel Partager → Écran d'accueil.
 */
export function InstallAppPrompt({ enabled = true }: { enabled?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return
    if (isStandalone()) return
    if (wasDismissedRecently()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)

    const onInstalled = () => {
      setVisible(false)
      setDeferred(null)
      markDismissed()
    }
    window.addEventListener("appinstalled", onInstalled)

    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(t)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [enabled])

  if (!enabled || !visible) return null

  const dismiss = () => {
    markDismissed()
    setVisible(false)
    setIosGuide(false)
  }

  const install = async () => {
    setHint(null)
    if (deferred) {
      try {
        await deferred.prompt()
        const choice = await deferred.userChoice
        if (choice.outcome === "accepted") {
          dismiss()
          return
        }
        setDeferred(null)
      } catch {
        setHint("Installation interrompue — tu pourras réessayer plus tard.")
      }
      return
    }
    if (isIos()) {
      setIosGuide(true)
      return
    }
    setHint("Menu ⋮ du navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil ».")
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-[4.5rem] z-[70] flex justify-center p-3 pointer-events-none sm:bottom-6"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-[#3e6757]/45 bg-[#0c1210]/95 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="flex items-start gap-3 p-3.5 sm:p-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3e6757]/25 text-[#9ec5b4]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Installer BreakingBad33 ?</p>
              <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">
                Accès rapide comme une app — notifications, hors navigateur, plus fluide.
              </p>
              {hint && <p className="mt-1.5 text-[11px] text-amber-200/90">{hint}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void install()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#3e6757] px-3.5 text-xs font-bold text-white hover:bg-[#4a7d6a]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Installer
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="min-h-9 rounded-xl px-3 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                >
                  Plus tard
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {iosGuide && (
        <div
          className="fixed inset-0 z-[8600] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setIosGuide(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Installer sur iPhone"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold text-foreground">Installer sur iPhone / iPad</h2>
              <button
                type="button"
                onClick={() => setIosGuide(false)}
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
                  Appuie sur <strong className="text-foreground">Partager</strong> (carré + flèche) dans
                  Safari.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <PlusSquare className="h-4 w-4" />
                </span>
                <span>
                  Choisis <strong className="text-foreground">Sur l&apos;écran d&apos;accueil</strong>,
                  puis Ajouter.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={dismiss}
              className="mt-5 w-full rounded-2xl bg-[#3e6757] py-3 text-sm font-bold text-white"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  )
}
