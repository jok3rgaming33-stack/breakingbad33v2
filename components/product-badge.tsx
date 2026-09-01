"use client"

import { badgeMeta } from "@/lib/badges"

type ProductBadgesProps = {
  badges: string[] | null | undefined
  /** Mode compact pour petites vignettes (orbite). */
  compact?: boolean
  /** Nombre max de badges visibles (le reste → +N). Défaut : tous / 2 en compact. */
  max?: number
}

// Affiche un ou plusieurs bandeaux empilés en haut à droite d'une vignette produit.
// Arrivage clignote (badge-blink).
export function ProductBadges({ badges, compact = false, max }: ProductBadgesProps) {
  const list = (badges ?? [])
    .map((k) => badgeMeta(k))
    .filter((m): m is NonNullable<typeof m> => !!m)
  if (list.length === 0) return null

  const limit = max ?? (compact ? 2 : 4)
  const visible = list.slice(0, limit)
  const extra = list.length - visible.length

  return (
    <div
      className={`pointer-events-none absolute z-20 flex max-w-[72%] flex-col items-end ${
        compact ? "right-1 top-1 gap-0.5" : "right-2 top-2 gap-1"
      }`}
    >
      {visible.map((meta) => {
        const blink =
          meta.key === "arrivage" ||
          ("blink" in meta && Boolean((meta as { blink?: boolean }).blink))
        return (
          <span
            key={meta.key}
            className={`max-w-full truncate rounded-full font-bold uppercase tracking-wider shadow-md ${meta.className} ${
              blink ? "badge-blink" : ""
            } ${
              compact
                ? "px-1.5 py-px text-[7px] leading-tight sm:text-[8px]"
                : "px-2 py-0.5 text-[9px]"
            }`}
            title={meta.label}
          >
            {meta.label}
          </span>
        )
      })}
      {extra > 0 && (
        <span
          className={`rounded-full bg-black/70 font-bold text-white shadow-md ${
            compact ? "px-1.5 py-px text-[7px]" : "px-2 py-0.5 text-[9px]"
          }`}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
