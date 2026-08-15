"use client"

import { useState, useEffect } from "react"
import { Star, X, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react"
import { submitRating, getRatableProducts, type RatableProduct } from "@/app/actions/ratings"

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composant : sélecteur d'étoiles
// ─────────────────────────────────────────────────────────────────────────────

function StarPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 shrink-0 text-sm text-zinc-400">{label}</span>
      <div
        className="flex gap-1"
        onMouseLeave={() => setHovered(0)}
        role="group"
        aria-label={label}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= (hovered || value)
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
              className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={`h-5 w-5 transition-colors ${
                  active ? "fill-amber-400 text-amber-400" : "text-zinc-600"
                }`}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RatingForm = {
  quality: number
  quantity: number
  packaging: number
  delivery: number
  comment: string
}

const DEFAULT_FORM: RatingForm = { quality: 0, quantity: 0, packaging: 0, delivery: 0, comment: "" }

// ─────────────────────────────────────────────────────────────────────────────
// Modale principale
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  customerToken: string
  threadId?: number // si on arrive depuis un thread spécifique
  onClose: () => void
}

export function ProductRatingModal({ customerToken, threadId, onClose }: Props) {
  const [products, setProducts] = useState<RatableProduct[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0) // index du produit en cours
  const [form, setForm] = useState<RatingForm>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<Set<string>>(new Set()) // "productId:threadId"

  // Chargement initial
  useEffect(() => {
    void (async () => {
      const list = await getRatableProducts(customerToken)
      const filtered = threadId ? list.filter((p) => p.threadId === threadId) : list
      setProducts(filtered)
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="fixed inset-0 z-[130] flex items-center justify-center bg-background/90">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      </div>
    )
  }

  const ratables = (products ?? []).filter((p) => !p.alreadyRated && !done.has(`${p.productId}:${p.threadId}`))

  if (!ratables.length) {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-background/90 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Notation terminée"
      >
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/20">
            <Check className="h-7 w-7 text-accent" />
          </div>
          <h3 className="mb-2 text-lg font-bold">Merci — tu fais avancer le labo</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Tes retours à chaque commande, même sur un produit que tu connais déjà, montrent que le niveau tient dans le temps. À très vite pour le prochain.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Fermer
          </button>
        </div>
      </div>
    )
  }

  const current = ratables[Math.min(step, ratables.length - 1)]
  const avgScore =
    form.quality > 0 && form.quantity > 0 && form.packaging > 0 && form.delivery > 0
      ? Math.round(((form.quality + form.quantity + form.packaging + form.delivery) / 4) * 10) / 10
      : null

  const handleSubmit = async () => {
    if ([form.quality, form.quantity, form.packaging, form.delivery].some((v) => v === 0)) {
      setError("Merci de renseigner les 4 critères.")
      return
    }
    setSubmitting(true)
    setError("")
    const res = await submitRating({
      customerToken,
      productId: current.productId,
      threadId: current.threadId,
      quality: form.quality,
      quantity: form.quantity,
      packaging: form.packaging,
      delivery: form.delivery,
      comment: form.comment,
    })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur lors de l'envoi.")
      return
    }
    const key = `${current.productId}:${current.threadId}`
    setDone((prev) => new Set([...prev, key]))
    setForm(DEFAULT_FORM)
    setStep((s) => Math.max(0, s))
  }

  const handleSkip = () => {
    setDone((prev) => new Set([...prev, `${current.productId}:${current.threadId}`]))
    setForm(DEFAULT_FORM)
    setStep((s) => Math.max(0, s))
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-background/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Noter ${current.productTitle}`}
    >
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
              {ratables.length > 1 ? `${Math.min(step, ratables.length - 1) + 1} / ${ratables.length}` : "Note ce produit"}
            </p>
            <h3 className="mt-0.5 truncate text-base font-bold">{current.productTitle}</h3>
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

        {/* Corps */}
        <div className="flex flex-col gap-4 p-5">
          {current.priorRatingCount > 0 && (
            <p className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90">
              Fidèle au poste : tu as déjà noté ce produit
              {current.priorRatingCount > 1 ? ` ${current.priorRatingCount} fois` : ""}.
              Un nouvel avis, c&apos;est la preuve que le niveau tient — et ça rassure ceux qui hésitent encore. Merci.
            </p>
          )}
          <StarPicker label="Qualité" value={form.quality} onChange={(v) => setForm((f) => ({ ...f, quality: v }))} />
          <StarPicker label="Quantité" value={form.quantity} onChange={(v) => setForm((f) => ({ ...f, quantity: v }))} />
          <StarPicker label="Conditionnement" value={form.packaging} onChange={(v) => setForm((f) => ({ ...f, packaging: v }))} />
          <StarPicker label="Livraison" value={form.delivery} onChange={(v) => setForm((f) => ({ ...f, delivery: v }))} />

          {avgScore !== null && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Note globale</span>
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-bold tabular-nums">{avgScore.toFixed(1)} / 5</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="rating-comment" className="mb-1 block text-xs text-muted-foreground">
              Commentaire <span className="text-zinc-500">(optionnel · 200 caractères max)</span>
            </label>
            <textarea
              id="rating-comment"
              rows={3}
              maxLength={200}
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Ton ressenti en quelques mots…"
              className="w-full resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-accent"
            />
            <p className="mt-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
              {form.comment.length}/200
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Pied de page */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Passer
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Envoyer
                {ratables.length > 1 && <ChevronRight className="h-4 w-4" />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
