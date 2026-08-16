/**
 * Estimation de temps de trajet (voiture) via OSRM —
 * même source que la carte interactive admin.
 * Module pur (pas de "use server") pour rester importable partout.
 */

const OSRM_BASE = "https://router.project-osrm.org"

/** Marge de conscience ajoutée au trajet brut (minutes). */
export const ETA_BUFFER_MIN = 3

export type LatLng = { lat: number; lng: number }

export type DriveEtaResult = {
  /** Minutes brutes trajet (OSRM ou approx) */
  driveMin: number
  /** Minutes communiquées au client = ceil(drive) + buffer */
  etaMin: number
  distanceKm: number
  /** "road" = OSRM, "approx" = repli haversine */
  mode: "road" | "approx"
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Repli si OSRM down : distance à vol d'oiseau × 1.4 (routes) / 28 km/h urbain. */
function approxEta(origin: LatLng, dest: LatLng, bufferMin: number): DriveEtaResult {
  const straight = haversineKm(origin, dest)
  const distanceKm = straight * 1.4
  const driveMin = (distanceKm / 28) * 60
  const etaMin = Math.max(1, Math.ceil(driveMin) + Math.max(0, bufferMin))
  return { driveMin, etaMin, distanceKm, mode: "approx" }
}

/**
 * Temps de trajet origin → dest.
 * @param origin point de départ (carte admin — à mettre à jour en multi-arrêt)
 */
export async function estimateDriveEtaBetween(
  origin: LatLng,
  dest: LatLng,
  bufferMin: number = ETA_BUFFER_MIN,
): Promise<DriveEtaResult | null> {
  if (
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(dest.lat) ||
    !Number.isFinite(dest.lng)
  ) {
    return null
  }

  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${origin.lng},${origin.lat};${dest.lng},${dest.lat}` +
    `?overview=false&steps=false`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    clearTimeout(timeout)

    if (res.ok) {
      const data = (await res.json()) as {
        code?: string
        routes?: Array<{ duration?: number; distance?: number }>
      }
      if (data.code === "Ok" && data.routes?.[0]) {
        const route = data.routes[0]
        const driveMin = (route.duration ?? 0) / 60
        if (driveMin > 0) {
          const etaMin = Math.max(1, Math.ceil(driveMin) + Math.max(0, bufferMin))
          return {
            driveMin,
            etaMin,
            distanceKm: (route.distance ?? 0) / 1000,
            mode: "road",
          }
        }
      }
    }
  } catch {
    /* fallback below */
  }

  // Repli toujours utilisable (pas de dépendance réseau OSRM)
  return approxEta(origin, dest, bufferMin)
}

/** Phrase prête pour le message client (legacy) ou notification. */
export function formatEtaMessageLine(etaMin: number): string {
  if (etaMin < 60) {
    return `⏱ Temps de trajet estimé : environ ${etaMin} min.`
  }
  const h = Math.floor(etaMin / 60)
  const m = etaMin % 60
  const human = m ? `${h} h ${m} min` : `${h} h`
  return `⏱ Temps de trajet estimé : environ ${human}.`
}

/** Phrase courte pour le suivi graphique / notification. */
export function formatEtaNotifyLine(etaMin: number): string {
  if (etaMin < 60) return `Arrivée estimée dans ~${etaMin} min.`
  const h = Math.floor(etaMin / 60)
  const m = etaMin % 60
  const human = m ? `${h} h ${m} min` : `${h} h`
  return `Arrivée estimée dans ~${human}.`
}
