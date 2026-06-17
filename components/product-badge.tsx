"use client"

import { useState } from "react"
import useSWR from "swr"
import { Tag, Check } from "lucide-react"
import { BADGE_OPTIONS, badgeMeta } from "@/lib/badges"
import { getProductBadges, setProductBadge } from "@/app/actions/badges"

// Hook partagé : une seule requête pour tous les bandeaux, partagée entre vignettes.
export function useProductBadges() {
  return useSWR("product-badges", () => getProductBadges(), {
    revalidateOnFocus: false,
  })
}

// Ruban diagonal affiché en haut à droite d'une vignette produit.
function Ribbon({ badgeKey }: { badgeKey: string }) {
  const meta = badgeMeta(badgeKey)
  if (!meta) return null
  return (
    <div className="pointer-events-none absolute -right-12 top-5 z-20 w-44 rotate-45 overflow-hidden">
      <div className={`py-1 text-center text-[11px] font-bold uppercase tracking-wider shadow-md ${meta.className}`}>
        {meta.label}
      </div>
    </div>
  )
}

type Props = {
  productKey: string
  badgeKey?: string | null
  isAdmin?: boolean
  onChanged?: () => void
}

// Affiche le ruban et, pour l'admin, un bouton qui ouvre un sélecteur de bandeau.
export function ProductBadge({ productKey, badgeKey, isAdmin, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const apply = async (key: string) => {
    setSaving(true)
    await setProductBadge(productKey, key)
    setSaving(false)
    setOpen(false)
    onChanged?.()
  }

  return (
    <>
      {badgeKey ? <Ribbon badgeKey={badgeKey} /> : null}

      {isAdmin && (
        <div className="absolute left-3 top-3 z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/90 backdrop-blur transition-colors hover:bg-black"
            aria-label="Modifier le bandeau"
            title="Modifier le bandeau"
          >
            <Tag className="h-4 w-4" aria-hidden="true" />
          </button>

          {open && (
            <div
              className="absolute left-0 top-10 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {BADGE_OPTIONS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  disabled={saving}
                  onClick={() => apply(b.key)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${b.className}`} aria-hidden="true" />
                    {b.label}
                  </span>
                  {badgeKey === b.key && <Check className="h-3.5 w-3.5 text-[#3e6757]" aria-hidden="true" />}
                </button>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={() => apply("")}
                className="w-full border-t border-white/10 px-3 py-2.5 text-left text-xs text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                Aucun bandeau
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
