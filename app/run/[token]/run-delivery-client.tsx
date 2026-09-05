"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, Clock, Home, Loader2, Navigation, Package } from "lucide-react"
import Link from "next/link"
import {
  advanceRunDelivery,
  getRunDelivery,
  type RunDeliveryView,
} from "@/app/actions/run-delivery"
import { statusMeta, normalizeStatus } from "@/lib/order-status"
import { AddToHomeScreen } from "@/components/add-to-home-screen"

export function RunDeliveryClient({ token }: { token: string }) {
  const [view, setView] = useState<RunDeliveryView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await getRunDelivery(token)
        if (!cancelled) {
          setView(data)
          if (!data) setError("Lien tournée invalide ou expiré.")
        }
      } catch {
        if (!cancelled) setError("Impossible de charger la tournée.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const act = (action: "arrivee" | "livree" | "eta5") => {
    startTransition(async () => {
      const res = await advanceRunDelivery(token, action)
      if (!res.ok) {
        setError(res.error ?? "Action impossible.")
        return
      }
      setError(null)
      if (res.view) setView(res.view)
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!view) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        {error ?? "Lien invalide."}
      </div>
    )
  }

  const key = normalizeStatus(view.status)
  const meta = statusMeta(view.status)
  const canArrive = key === "livraison"
  const canDeliver = key === "livraison" || key === "arrivee"
  const done = key === "livree"

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Navigation className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mode tournée</p>
            <h1 className="text-lg font-bold">Commande #{view.id}</h1>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{view.customerName}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {view.fulfillment === "meetup" ? "Meet-up" : view.fulfillment === "locker" ? "Locker" : "Livraison"}
            {view.scheduledDate ? ` · ${view.scheduledDate}` : ""}
            {view.scheduledSlot ? ` · ${view.scheduledSlot}` : ""}
            {` · ${view.total}€`}
          </p>
          {view.address && (
            <p className="mt-3 rounded-2xl border border-white/10 bg-background px-3 py-2 text-sm">
              {view.address}
            </p>
          )}
          {view.etaMin != null && key === "livraison" && (
            <p className="mt-3 text-sm text-accent">ETA interne ~{view.etaMin} min</p>
          )}
        </div>

        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center">
            <Check className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Commande livrée</p>
            <p className="text-xs text-emerald-200/80">Points fidélité crédités · invitation d&apos;avis envoyée.</p>
            <Link href="/run" className="text-xs text-emerald-200 underline-offset-2 hover:underline">
              Retour à la tournée
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => act("eta5")}
              disabled={pending || !canDeliver}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
              Je suis là dans 5 minutes
            </button>
            <button
              type="button"
              onClick={() => act("arrivee")}
              disabled={pending || !canArrive}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Home className="h-5 w-5" />}
              Je suis arrivé
            </button>
            <button
              type="button"
              onClick={() => act("livree")}
              disabled={pending || !canDeliver}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
              Marquer livrée
            </button>
            <AddToHomeScreen startPath={`/run/${token}`} />
            <Link href="/run" className="text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline">
              Voir toutes les livraisons en cours
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
