"use client"

import { useState, useEffect } from "react"
import { Star, X, ChevronDown, Loader2 } from "lucide-react"
import type { ProductRatingSummary, ProductRatingDetail } from "@/app/actions/ratings"
import { getProductRatingDetails } from "@/app/actions/ratings"

// ─────────────────────────────────────────────────────────────────────────────
// Badge compact affiché sur la vignette
// ─────────────────────────────────────────────────────────────────────────────

export function RatingBadge({
  summary,
  productTitle,
}: {
  summary: ProductRatingSummary
  productTitle: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`Note ${summary.avgScore}/5 — voir les avis pour ${productTitle}`}
        className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/25"
      >
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        <span className="font-mono text-[11px] font-bold tabular-nums text-amber-300 leading-none">
          {summary.avgScore.toFixed(1)}
        </span>
        <span className="text-[10px] text-zinc-400 leading-none">({summary.count})</span>
      </button>

      {open && (
        <RatingDetailsModal
          productId={summary.productId}
          productTitle={productTitle}
          summary={summary}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini barre d'étoiles (lecture seule)
// ─────────────────────────────────────────────────────────────────────────────

function StarDisplay({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} sur ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-zinc-700 text-zinc-700"
          }`}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modale de synthèse des avis
// ─────────────────────────────────────────────────────────────────────────────

function RatingDetailsModal({
  productId,
  productTitle,
  summary,
  onClose,
}: {
  productId: number
  productTitle: string
  summary: ProductRatingSummary
  onClose: () => void
}) {
  const [details, setDetails] = useState<ProductRatingDetail[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Chargement au montage
  useEffect(() => {
    void (async () => {
      const data = await getProductRatingDetails(productId)
      setDetails(data)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const CRITERIA = [
    { key: "quality" as const, label: "Qualité" },
    { key: "quantity" as const, label: "Quantité" },
    { key: "packaging" as const, label: "Conditionnement" },
    { key: "delivery" as const, label: "Livraison" },
  ]

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Avis pour ${productTitle}`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">Avis clients</p>
            <h3 className="mt-0.5 truncate text-base font-bold">{productTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Résumé global */}
        <div className="flex items-center gap-5 border-b border-border px-5 py-4">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-4xl font-black tabular-nums">{summary.avgScore.toFixed(1)}</span>
            <StarDisplay value={summary.avgScore} />
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {summary.count} avis
            </span>
          </div>
          {details && details.length > 0 && (
            <div className="flex flex-1 flex-col gap-1">
              {CRITERIA.map((c) => {
                const avg =
                  Math.round(
                    (details.reduce((s, d) => s + d[c.key], 0) / details.length) * 10,
                  ) / 10
                return (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{c.label}</span>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-secondary" style={{ height: 4 }}>
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-amber-400"
                        style={{ width: `${(avg / 5) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
                      {avg.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Liste des avis */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Chargement des avis…</span>
            </div>
          ) : !details?.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucun avis pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {details.map((d, idx) => {
                const isExp = expanded === d.id
                const displayName = d.pseudo ?? `…${d.customerToken.slice(-6).toUpperCase()}`
                const avatarLetters = displayName.replace(/^…/, "").slice(0, 2).toUpperCase()
                const date = new Date(d.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isExp ? null : d.id)}
                      className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/30"
                    >
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                        {avatarLetters}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{displayName}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{date}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <StarDisplay value={d.avgScore} />
                          <span className="text-[10px] tabular-nums text-amber-300">
                            {d.avgScore.toFixed(1)}
                          </span>
                        </div>
                        {d.comment && !isExp && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{d.comment}</p>
                        )}
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isExp && (
                      <div className="border-t border-border/50 bg-secondary/20 px-5 py-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          {CRITERIA.map((c) => (
                            <div key={c.key} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground">{c.label}</span>
                              <div className="flex items-center gap-1">
                                <StarDisplay value={d[c.key]} max={5} />
                                <span className="text-[10px] tabular-nums text-amber-300">{d[c.key]}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {d.comment && (
                          <p className="mt-3 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-foreground/80">
                            {d.comment}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
