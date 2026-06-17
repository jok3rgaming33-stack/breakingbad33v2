"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OrderThread } from "@/lib/db/schema"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { isClosedStatus } from "@/lib/order-status"
import { Map as MapIcon, MapPinOff, Route, RotateCcw, Truck, Store, Loader2, Clock } from "lucide-react"
import "leaflet/dist/leaflet.css"

// Point de départ par défaut (modifiable en cliquant sur la carte)
const DEFAULT_ORIGIN = { lat: 44.841575, lng: -0.581069 }

// Serveur de routage routier public (OSRM). Le service "trip" optimise l'ordre
// des arrêts (problème du voyageur de commerce) ET renvoie un tracé qui suit
// réellement les routes — pas une ligne droite à vol d'oiseau.
const OSRM_BASE = "https://router.project-osrm.org"

type Located = OrderThread & { lat: number; lng: number }
type LatLng = { lat: number; lng: number }

type Routing = {
  ordered: Located[]
  geometry: [number, number][] // tracé routier [lat, lng]
  distanceKm: number
  durationMin: number
  legKm: Record<number, number> // distance routière de l'arrêt précédent à cet arrêt
  mode: "road" | "approx"
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Distance approximative entre deux points (km), formule de Haversine.
// Utilisée uniquement en repli si le serveur de routage est indisponible.
function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Nombre de jours entre aujourd'hui et la date prévue (yyyy-mm-dd)
function dayDiff(scheduledDate?: string | null): number | null {
  if (!scheduledDate) return null
  const parts = scheduledDate.split("-").map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  const [y, m, d] = parts
  const target = new Date(y, m - 1, d)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

// Couleur + libellé d'urgence selon l'échéance de livraison
function urgency(diff: number | null) {
  if (diff === null) return { color: "#9ca3af", label: "Sans date", short: "—" }
  if (diff <= 0) return { color: "#ef4444", label: "Aujourd'hui", short: "J" }
  if (diff === 1) return { color: "#f97316", label: "Demain (J+1)", short: "J+1" }
  if (diff === 2) return { color: "#eab308", label: "Dans 2 jours (J+2)", short: "J+2" }
  return { color: "#22c55e", label: `Dans ${diff} jours (J+${diff})`, short: `J+${diff}` }
}

// Repli : ordre glouton (plus proche voisin) à vol d'oiseau si le routage échoue
function greedyOrder(start: LatLng, points: Located[]): Located[] {
  const remaining = [...points]
  const ordered: Located[] = []
  let current = { lat: start.lat, lng: start.lng }
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(current, { lat: remaining[i].lat, lng: remaining[i].lng })
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    const [next] = remaining.splice(bestIdx, 1)
    ordered.push(next)
    current = { lat: next.lat, lng: next.lng }
  }
  return ordered
}

// Construit un repli (ordre glouton + tracé en ligne droite) si OSRM échoue.
function buildApproxRouting(start: LatLng, points: Located[]): Routing {
  const ordered = greedyOrder(start, points)
  const geometry: [number, number][] = [
    [start.lat, start.lng],
    ...ordered.map((t) => [t.lat, t.lng] as [number, number]),
  ]
  const legKm: Record<number, number> = {}
  let prev: LatLng = start
  let distanceKm = 0
  for (const t of ordered) {
    const d = haversineKm(prev, { lat: t.lat, lng: t.lng })
    legKm[t.id] = d
    distanceKm += d
    prev = { lat: t.lat, lng: t.lng }
  }
  return { ordered, geometry, distanceKm, durationMin: 0, legKm, mode: "approx" }
}

// Appelle OSRM "trip" pour optimiser l'ordre + obtenir le tracé routier.
async function fetchOptimizedTrip(
  start: LatLng,
  points: Located[],
  signal: AbortSignal,
): Promise<Routing | null> {
  const coords = [start, ...points.map((p) => ({ lat: p.lat, lng: p.lng }))]
  const coordStr = coords.map((c) => `${c.lng},${c.lat}`).join(";")
  const url = `${OSRM_BASE}/trip/v1/driving/${coordStr}?source=first&roundtrip=false&geometries=geojson&overview=full`

  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const data = await res.json()
  if (data.code !== "Ok" || !data.trips?.[0] || !Array.isArray(data.waypoints)) return null

  const trip = data.trips[0]
  const waypoints = data.waypoints as Array<{ waypoint_index: number }>

  // Réordonne les arrêts selon leur position optimisée dans la tournée.
  // waypoints[0] est le départ (waypoint_index 0), waypoints[i+1] -> points[i].
  const withIndex = points.map((p, i) => ({ p, wp: waypoints[i + 1]?.waypoint_index ?? i + 1 }))
  withIndex.sort((a, b) => a.wp - b.wp)
  const ordered = withIndex.map((x) => x.p)

  // Distance routière de chaque tronçon (leg[k] = position k -> k+1).
  const legs = (trip.legs ?? []) as Array<{ distance: number }>
  const legKm: Record<number, number> = {}
  ordered.forEach((t, idx) => {
    const leg = legs[idx]
    if (leg) legKm[t.id] = leg.distance / 1000
  })

  const geometry: [number, number][] = (trip.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
  )

  return {
    ordered,
    geometry: geometry.length
      ? geometry
      : [[start.lat, start.lng], ...ordered.map((t) => [t.lat, t.lng] as [number, number])],
    distanceKm: (trip.distance ?? 0) / 1000,
    durationMin: (trip.duration ?? 0) / 60,
    legKm,
    mode: "road",
  }
}

export function AdminMap({ threads }: { threads: OrderThread[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const LRef = useRef<typeof import("leaflet") | null>(null)
  const overlayRef = useRef<import("leaflet").LayerGroup | null>(null)
  const [ready, setReady] = useState(false)

  const [departure, setDeparture] = useState(DEFAULT_ORIGIN)

  // Commandes géolocalisées NON livrées/annulées (les livrées sont retirées de la carte)
  const located = useMemo<Located[]>(
    () =>
      threads.filter(
        (t): t is Located =>
          typeof t.lat === "number" && typeof t.lng === "number" && !isClosedStatus(t.status),
      ),
    [threads],
  )

  // Sélection des commandes à inclure dans la tournée (toutes par défaut)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    if (located.length === 0) return
    initRef.current = true
    setSelectedIds(new Set(located.map((t) => t.id)))
  }, [located])

  const orderCountByClient = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of threads) {
      const key = t.customerToken || t.customerName
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [threads])

  const selectedLocated = useMemo(
    () => located.filter((t) => selectedIds.has(t.id)),
    [located, selectedIds],
  )

  // Itinéraire routier (optimisé via OSRM, repli en ligne droite si indisponible)
  const [routing, setRouting] = useState<Routing>({
    ordered: [],
    geometry: [],
    distanceKm: 0,
    durationMin: 0,
    legKm: {},
    mode: "road",
  })
  const [routeLoading, setRouteLoading] = useState(false)

  // Clé stable pour ne relancer le calcul que si le départ ou la sélection change
  const routeKey = useMemo(
    () =>
      `${departure.lat.toFixed(5)},${departure.lng.toFixed(5)}|${selectedLocated
        .map((t) => t.id)
        .join(",")}`,
    [departure, selectedLocated],
  )

  useEffect(() => {
    if (selectedLocated.length === 0) {
      setRouting({ ordered: [], geometry: [], distanceKm: 0, durationMin: 0, legKm: {}, mode: "road" })
      setRouteLoading(false)
      return
    }

    const controller = new AbortController()
    setRouteLoading(true)
    // Petit délai anti-rebond pour éviter de spammer le serveur pendant un glisser
    const timer = setTimeout(async () => {
      try {
        const trip = await fetchOptimizedTrip(departure, selectedLocated, controller.signal)
        if (controller.signal.aborted) return
        setRouting(trip ?? buildApproxRouting(departure, selectedLocated))
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return
        // Repli silencieux : on conserve une tournée utilisable hors-ligne
        setRouting(buildApproxRouting(departure, selectedLocated))
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false)
      }
    }, 350)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  const route = routing.ordered
  const totalDistance = routing.distanceKm

  // Position de chaque commande dans la tournée (id -> n°)
  const orderIndex = useMemo(() => {
    const map = new Map<number, number>()
    route.forEach((t, i) => map.set(t.id, i + 1))
    return map
  }, [route])

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Création de la carte (une seule fois)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        [DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng],
        12,
      )
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map)

      overlayRef.current = L.layerGroup().addTo(map)

      // Clic sur la carte => définit le point de départ
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        setDeparture({ lat: e.latlng.lat, lng: e.latlng.lng })
      })

      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        overlayRef.current = null
        LRef.current = null
        setReady(false)
      }
    }
  }, [])

  // Redessine marqueurs + itinéraire à chaque changement
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    const overlay = overlayRef.current
    if (!ready || !L || !map || !overlay) return

    overlay.clearLayers()

    // Marqueur du point de départ (déplaçable)
    const departureMarker = L.marker([departure.lat, departure.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "",
        html: '<div style="background:#e11d48;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #e11d48"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    })
      .addTo(overlay)
      .bindPopup("<strong>Point de départ</strong><br/>Glisse-moi ou clique sur la carte pour me déplacer")
    departureMarker.on("dragend", () => {
      const pos = departureMarker.getLatLng()
      setDeparture({ lat: pos.lat, lng: pos.lng })
    })

    // Tracé de l'itinéraire (suit les routes si routage réussi)
    if (routing.geometry.length > 1) {
      L.polyline(routing.geometry, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.8,
        dashArray: routing.mode === "approx" ? "6 8" : undefined,
      }).addTo(overlay)
    }

    // Marqueurs des commandes
    for (const t of located) {
      const diff = dayDiff(t.scheduledDate)
      const u = urgency(diff)
      const selected = selectedIds.has(t.id)
      const n = orderIndex.get(t.id)
      const points = computeLoyaltyPoints(t.total ?? 0)
      const key = t.customerToken || t.customerName
      const count = orderCountByClient.get(key) ?? 1

      const inner = selected && n != null ? String(n) : ""
      const size = selected ? 26 : 18
      const html = `<div style="display:flex;align-items:center;justify-content:center;background:${u.color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1.5px ${u.color};color:#fff;font-size:12px;font-weight:700;${selected ? "" : "opacity:0.55"}">${inner}</div>`

      const popup = `
        <div style="min-width:190px;font-family:inherit">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px">${escapeHtml(t.customerName)}</div>
          <div style="display:inline-block;background:${u.color};color:#fff;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;margin-bottom:6px">${escapeHtml(u.label)}</div>
          <div style="font-size:12px;line-height:1.5">
            <div><strong>Produits :</strong> ${escapeHtml(t.products ?? "—")}</div>
            <div><strong>Montant :</strong> ${t.total ?? 0}€</div>
            <div><strong>Mode :</strong> ${t.fulfillment === "meetup" ? "Meet-up" : "Livraison"}</div>
            <div><strong>Points générés :</strong> +${points}</div>
            <div><strong>Commandes du client :</strong> ${count}</div>
            <div><strong>Adresse :</strong> ${escapeHtml(t.address ?? "—")}</div>
          </div>
        </div>`

      const marker = L.marker([t.lat, t.lng], {
        icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
      })
        .addTo(overlay)
        .bindPopup(popup)
      marker.on("click", () => toggleSelected(t.id))
    }

    // Cadre la vue sur le départ + commandes
    const pts: [number, number][] = [[departure.lat, departure.lng], ...located.map((t) => [t.lat, t.lng] as [number, number])]
    if (pts.length > 1) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, located, selectedIds, departure, routing, orderIndex, orderCountByClient])

  const unlocatedCount = threads.filter((t) => !isClosedStatus(t.status)).length - located.length
  const deliveredCount = threads.filter((t) => isClosedStatus(t.status)).length

  const legend = [
    { color: "#ef4444", label: "Aujourd'hui" },
    { color: "#f97316", label: "J+1" },
    { color: "#eab308", label: "J+2" },
    { color: "#22c55e", label: "J+3 et +" },
    { color: "#9ca3af", label: "Sans date" },
  ]

  const durationLabel = useMemo(() => {
    const min = Math.round(routing.durationMin)
    if (min <= 0) return null
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h} h ${m} min` : `${h} h`
  }, [routing.durationMin])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <MapIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Tournée de livraison</h2>
            <p className="text-xs text-muted-foreground">
              Clique sur la carte (ou glisse le point rouge) pour définir ton point de départ, puis choisis les
              commandes à assurer. L&apos;itinéraire est calculé par la route.
            </p>
          </div>
        </div>
      </div>

      {/* Légende des échéances */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-[#e11d48]" aria-hidden="true" /> Départ
        </span>
        <span className="h-3 w-px bg-border" aria-hidden="true" />
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.color }} aria-hidden="true" />
            {l.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div
          ref={containerRef}
          className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-card"
          aria-label="Carte des livraisons"
        />

        {/* Panneau de tournée */}
        <div className="flex max-h-[60vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Itinéraire optimisé</h3>
              {routeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {route.length} arrêt{route.length > 1 ? "s" : ""} · ~{totalDistance.toFixed(1)} km par la route
              </span>
              {durationLabel && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" /> {durationLabel}
                </span>
              )}
            </p>
            {routing.mode === "approx" && route.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-500">
                Routage indisponible : estimation à vol d&apos;oiseau affichée.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(located.map((t) => t.id)))}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary"
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary"
              >
                Tout retirer
              </button>
              <button
                type="button"
                onClick={() => setDeparture(DEFAULT_ORIGIN)}
                className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary"
                title="Réinitialiser le point de départ"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Départ
              </button>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {located.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucune commande à livrer pour le moment.
              </li>
            )}
            {located.map((t) => {
              const u = urgency(dayDiff(t.scheduledDate))
              const selected = selectedIds.has(t.id)
              const n = orderIndex.get(t.id)
              const legDist = routing.legKm[t.id]
              return (
                <li key={t.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-secondary ${
                      selected ? "" : "opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelected(t.id)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    {selected && n != null && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                        {n}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{t.customerName}</span>
                        {t.fulfillment === "meetup" ? (
                          <Store className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <Truck className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-white"
                          style={{ background: u.color }}
                        >
                          {u.short}
                        </span>
                        <span>{t.total ?? 0}€</span>
                        {selected && legDist != null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{legDist.toFixed(1)} km</span>
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {(unlocatedCount > 0 || deliveredCount > 0) && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {unlocatedCount > 0 && (
            <span>
              {unlocatedCount} commande{unlocatedCount > 1 ? "s" : ""} sans localisation (meet-up ou adresse non
              géocodée).{" "}
            </span>
          )}
          {deliveredCount > 0 && (
            <span>
              {deliveredCount} commande{deliveredCount > 1 ? "s" : ""} livrée{deliveredCount > 1 ? "s" : ""} masquée
              {deliveredCount > 1 ? "s" : ""} de la carte (visible dans Récap commandes).
            </span>
          )}
        </p>
      )}
    </div>
  )
}
