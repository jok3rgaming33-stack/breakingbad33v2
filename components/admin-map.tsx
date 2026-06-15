"use client"

import { useEffect, useMemo, useRef } from "react"
import type { OrderThread } from "@/lib/db/schema"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { Map as MapIcon, MapPinOff } from "lucide-react"
import "leaflet/dist/leaflet.css"

// Point de départ des livraisons (identique à app/api/geocode/route.ts)
const ORIGIN = { lat: 44.841575, lng: -0.581069 }

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function AdminMap({ threads }: { threads: OrderThread[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  // Commandes géolocalisables (livraison avec coordonnées)
  const located = useMemo(
    () => threads.filter((t) => typeof t.lat === "number" && typeof t.lng === "number"),
    [threads],
  )

  // Nombre de commandes par client (clé = token sinon pseudo)
  const orderCountByClient = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of threads) {
      const key = t.customerToken || t.customerName
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [threads])

  useEffect(() => {
    let cancelled = false
    let map: import("leaflet").Map | null = null

    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current) return

      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([ORIGIN.lat, ORIGIN.lng], 12)
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map)

      // Zone de livraison à tarif normal (10 km)
      L.circle([ORIGIN.lat, ORIGIN.lng], {
        radius: 10000,
        color: "#3e6757",
        weight: 1.5,
        fillColor: "#3e6757",
        fillOpacity: 0.06,
      }).addTo(map)

      // Marqueur du point de départ
      L.marker([ORIGIN.lat, ORIGIN.lng], {
        icon: L.divIcon({
          className: "",
          html: '<div style="background:#e11d48;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #e11d48"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      })
        .addTo(map)
        .bindPopup("<strong>Point de départ</strong><br/>Base des livraisons")

      const bounds: [number, number][] = [[ORIGIN.lat, ORIGIN.lng]]

      for (const t of located) {
        const lat = t.lat as number
        const lng = t.lng as number
        const key = t.customerToken || t.customerName
        const orderCount = orderCountByClient.get(key) ?? 1
        const points = computeLoyaltyPoints(t.total ?? 0)
        const token = t.customerToken
          ? `${t.customerToken.slice(0, 10)}…`
          : "—"

        const popup = `
          <div style="min-width:180px;font-family:inherit">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escapeHtml(t.customerName)}</div>
            <div style="font-size:11px;color:#666;font-family:monospace;margin-bottom:6px">${escapeHtml(token)}</div>
            <div style="font-size:12px;line-height:1.5">
              <div><strong>Produits :</strong> ${escapeHtml(t.products ?? "—")}</div>
              <div><strong>Montant :</strong> ${t.total ?? 0}€</div>
              <div><strong>Points générés :</strong> +${points}</div>
              <div><strong>Commandes du client :</strong> ${orderCount}</div>
              <div><strong>Adresse :</strong> ${escapeHtml(t.address ?? "—")}</div>
            </div>
          </div>`

        L.circleMarker([lat, lng], {
          radius: 9,
          color: "#fff",
          weight: 2,
          fillColor: "#3e6757",
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindPopup(popup)

        bounds.push([lat, lng])
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      }

      // Recalcule la taille une fois le conteneur peint
      setTimeout(() => map?.invalidateSize(), 100)
    })()

    return () => {
      cancelled = true
      if (map) {
        map.remove()
        mapRef.current = null
      }
    }
  }, [located, orderCountByClient])

  const unlocatedCount = threads.length - located.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <MapIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Carte interactive</h2>
            <p className="text-xs text-muted-foreground">
              {located.length} commande{located.length > 1 ? "s" : ""} géolocalisée
              {located.length > 1 ? "s" : ""}. Clique sur un point pour voir le détail.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#e11d48]" aria-hidden="true" /> Départ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-accent" aria-hidden="true" /> Commande
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-card"
        aria-label="Carte des livraisons"
      />

      {unlocatedCount > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {unlocatedCount} commande{unlocatedCount > 1 ? "s" : ""} sans localisation (retrait meet-up ou adresse non
          géocodée) — visible{unlocatedCount > 1 ? "s" : ""} dans l&apos;onglet Récap commandes.
        </p>
      )}
    </div>
  )
}
