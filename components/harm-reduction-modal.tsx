"use client"

import { X, HeartPulse, AlertTriangle } from "lucide-react"
import { backdropDismissProps } from "@/lib/backdrop-close"
import { HARM_TIPS } from "@/lib/harm-reduction"

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function HarmReductionModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Réduction des risques"
      {...backdropDismissProps(onClose)}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[#3e6757]/40 bg-[#0a0a0a] shadow-[0_0_80px_rgba(62,103,87,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9ec5b4]">
              <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
              Réduction des risques
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
              Tableau des risques liés aux mélanges
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Ce tableau n&apos;est pas un feu vert. C&apos;est un outil pour éviter les associations les plus
              dangereuses. Informe-toi, dose bas, ne sois pas seul.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/tableau-risques-melanges.jpg"
            alt="Tableau des risques liés aux mélanges — BreakingBad33"
            className="mx-auto block h-auto w-full max-w-none object-contain sm:min-w-[720px]"
          />
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-3 sm:px-6">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ec5b4]">
            Les 12 règles
          </p>
          <ol className="grid max-h-28 gap-1 overflow-y-auto text-[11px] leading-snug text-zinc-400 sm:grid-cols-2">
            {HARM_TIPS.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-[#3e6757]">{String(i + 1).padStart(2, "0")}</span>
                {tip}
              </li>
            ))}
          </ol>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
            Guide de référence rapide, pas un avis médical. Données inspirées de TripSit / Modus Vivendi.
          </p>
        </div>
      </div>
    </div>
  )
}
