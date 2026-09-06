"use client"

import { useMemo, useState } from "react"
import { X, HeartPulse, AlertTriangle, ArrowRight } from "lucide-react"
import { backdropDismissProps } from "@/lib/backdrop-close"
import {
  COMBO_META,
  GROUP_LABEL,
  HARM_TIPS,
  SUBSTANCES,
  comboOf,
  type ComboLevel,
  type SubstanceGroup,
} from "@/lib/harm-reduction"

const LEVELS: ComboLevel[] = ["synergy", "safe", "attenuate", "caution", "risk", "danger"]

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function HarmReductionModal({ isOpen, onClose }: Props) {
  const [a, setA] = useState(9)
  const [b, setB] = useState(18)

  const level = useMemo(() => comboOf(a, b), [a, b])
  const meta = COMBO_META[level]
  const sa = SUBSTANCES[a]
  const sb = SUBSTANCES[b]

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
              Choisis deux substances : le module lit le tableau. Ce n&apos;est pas un feu vert — informe-toi,
              dose bas, ne sois pas seul.
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-white/10 px-4 py-4 sm:px-6">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ec5b4]">
              Vérifier un mélange
            </p>
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <SubstanceSelect label="Produit A" value={a} onChange={setA} />
              <ArrowRight className="mx-auto hidden h-5 w-5 text-[#3e6757] sm:mb-3 sm:block" aria-hidden="true" />
              <SubstanceSelect label="Produit B" value={b} onChange={setB} />
            </div>

            <div
              className="mt-4 rounded-2xl border px-4 py-4 sm:px-5"
              style={{ borderColor: `${meta.color}66`, background: meta.bg }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: meta.color }}>
                {sa.label} + {sb.label}
              </p>
              <p className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: meta.color }}>
                <span className="mr-2 font-mono">{meta.symbol}</span>
                {meta.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">{meta.hint}</p>
            </div>

            <ul className="mt-3 flex flex-wrap gap-1.5">
              {LEVELS.map((lv) => {
                const m = COMBO_META[lv]
                return (
                  <li
                    key={lv}
                    className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400"
                  >
                    <span
                      className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] font-mono text-[9px] font-bold"
                      style={{ background: m.bg, color: m.color }}
                    >
                      {m.symbol}
                    </span>
                    {m.label}
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/tableau-risques-melanges.jpg"
              alt="Tableau des risques liés aux mélanges — BreakingBad33"
              className="mx-auto block h-auto w-full object-contain sm:min-w-[720px]"
            />
          </div>

          <div className="border-t border-white/10 px-4 py-3 sm:px-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ec5b4]">
              Les 12 règles
            </p>
            <ol className="grid gap-1 text-[11px] leading-snug text-zinc-400 sm:grid-cols-2">
              {HARM_TIPS.map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-[#3e6757]">{String(i + 1).padStart(2, "0")}</span>
                  {tip}
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
              Guide de référence rapide, pas un avis médical. Lecture du tableau TripSit / Modus Vivendi.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SubstanceSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<SubstanceGroup, { i: number; label: string }[]>()
    SUBSTANCES.forEach((s, i) => {
      const arr = map.get(s.group) ?? []
      arr.push({ i, label: s.label })
      map.set(s.group, arr)
    })
    return map
  }, [])

  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white outline-none focus:border-[#3e6757]"
      >
        {[...groups.entries()].map(([g, items]) => (
          <optgroup key={g} label={GROUP_LABEL[g]}>
            {items.map((it) => (
              <option key={it.i} value={it.i}>
                {it.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
