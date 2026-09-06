"use client"

import { useMemo, useState } from "react"
import { X, HeartPulse, AlertTriangle } from "lucide-react"
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
  const [a, setA] = useState(15)
  const [b, setB] = useState(18)
  const [tab, setTab] = useState<"lookup" | "grid" | "tips">("lookup")

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
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#3e6757]/40 bg-[#0a0a0a] shadow-[0_0_80px_rgba(62,103,87,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9ec5b4]">
              <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
              Réduction des risques
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
              Guide des combinaisons
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Ce tableau n&apos;est pas un feu vert. C&apos;est un outil pour éviter les mélanges les plus
              dangereux. La seule dose sûre, c&apos;est celle que tu ne prends pas — et si tu prends, tu
              t&apos;informes.
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

        <div className="flex shrink-0 gap-1 border-b border-white/10 px-3 py-2 sm:px-5">
          {(
            [
              ["lookup", "Vérifier un mélange"],
              ["grid", "Grille complète"],
              ["tips", "Les 12 règles"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                tab === id
                  ? "bg-[#3e6757] text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === "lookup" && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <SubstanceSelect label="Substance A" value={a} onChange={setA} />
                <SubstanceSelect label="Substance B" value={b} onChange={setB} />
              </div>

              <div
                className="rounded-2xl border px-4 py-5 sm:px-6"
                style={{ borderColor: meta.color + "55", background: meta.bg }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: meta.color }}>
                  {sa.label} × {sb.label}
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight" style={{ color: meta.color }}>
                  <span className="mr-2 font-mono">{meta.symbol}</span>
                  {meta.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-200">{meta.hint}</p>
              </div>

              <ul className="flex flex-wrap gap-2">
                {LEVELS.map((lv) => {
                  const m = COMBO_META[lv]
                  return (
                    <li
                      key={lv}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-zinc-300"
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-sm font-mono text-[10px] font-bold"
                        style={{ background: m.bg, color: m.color }}
                      >
                        {m.symbol}
                      </span>
                      {m.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {tab === "grid" && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Sur mobile, fais défiler horizontalement. Touche une case pour la charger dans
                « Vérifier un mélange ».
              </p>
              <div className="overflow-auto rounded-2xl border border-white/10">
                <table className="border-collapse text-[9px] sm:text-[10px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[4.5rem] bg-[#111] px-1 py-1 text-left font-semibold text-zinc-500">
                        ×
                      </th>
                      {SUBSTANCES.map((s) => (
                        <th
                          key={s.id}
                          className="min-w-[2.1rem] max-w-[2.4rem] bg-[#111] px-0.5 py-2 font-medium leading-tight text-zinc-400"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                        >
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SUBSTANCES.map((row, i) => (
                      <tr key={row.id}>
                        <th className="sticky left-0 z-10 truncate bg-[#0e0e0e] px-1.5 py-0.5 text-left font-semibold text-zinc-300">
                          {row.label}
                        </th>
                        {SUBSTANCES.map((col, j) => {
                          const lv = comboOf(i, j)
                          const m = COMBO_META[lv]
                          const active = (i === a && j === b) || (i === b && j === a)
                          return (
                            <td key={col.id} className="p-0">
                              <button
                                type="button"
                                title={`${row.label} × ${col.label} — ${m.label}`}
                                onClick={() => {
                                  setA(i)
                                  setB(j)
                                  setTab("lookup")
                                }}
                                className={`flex h-7 w-7 items-center justify-center font-mono text-[11px] font-bold sm:h-8 sm:w-8 ${
                                  active ? "ring-2 ring-white" : ""
                                }`}
                                style={{ background: m.bg, color: m.color }}
                              >
                                {lv === "self" ? "" : m.symbol}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "tips" && (
            <ol className="grid gap-2 sm:grid-cols-2">
              {HARM_TIPS.map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-[#111] px-3 py-3 text-sm text-zinc-300"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3e6757] text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          )}
        </div>

        <footer className="shrink-0 space-y-1.5 border-t border-white/10 px-5 py-3 text-[10px] leading-relaxed text-zinc-500 sm:px-6">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
            Guide de référence rapide, pas un substitut à un avis médical ou à un analyseur de produits.
            Données adaptées du chart TripSit (combo.tripsit.me) — CC, à des fins de réduction des risques.
          </p>
          <p>
            Plus d&apos;infos :{" "}
            <a
              href="https://combo.tripsit.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9ec5b4] underline-offset-2 hover:underline"
            >
              combo.tripsit.me
            </a>
            {" · "}
            <a
              href="https://modusvivendi-be.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9ec5b4] underline-offset-2 hover:underline"
            >
              Modus Vivendi
            </a>
          </p>
        </footer>
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
