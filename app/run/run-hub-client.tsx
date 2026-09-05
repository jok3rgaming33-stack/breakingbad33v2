"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Navigation, Package } from "lucide-react"
import { listActiveRunDeliveries, type ActiveRunRow } from "@/app/actions/run-delivery"
import { statusMeta } from "@/lib/order-status"
import { AddToHomeScreen } from "@/components/add-to-home-screen"

export function RunHubClient() {
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState(false)
  const [rows, setRows] = useState<ActiveRunRow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await listActiveRunDeliveries()
        if (!cancelled) {
          setAdmin(data.admin)
          setRows(data.rows)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Navigation className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mode tournée</p>
          <h1 className="text-lg font-bold">Écran d&apos;accueil</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Ajoute cette page à l&apos;accueil du téléphone. Ensuite : un tap, les boutons 5 min / Arrivé / Livré, sans ouvrir le panel.
      </p>

      <AddToHomeScreen startPath="/run" />

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !admin ? (
        <div className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Connecte-toi d&apos;abord au panel admin (une fois), puis reviens ici pour voir tes livraisons en cours.
          Tu peux aussi ouvrir le lien tournée copié depuis une commande.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Aucune commande en livraison pour le moment.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const meta = statusMeta(row.status)
            return (
              <li key={row.id}>
                <Link
                  href={`/run/${row.runToken}`}
                  className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">#{row.id} · {row.customerName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.total}€
                    {row.scheduledSlot ? ` · ${row.scheduledSlot}` : ""}
                    {row.etaMin != null ? ` · ETA ~${row.etaMin} min` : ""}
                  </p>
                  {row.address && <p className="text-xs text-zinc-400">{row.address}</p>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
