/**
 * Estimation de temps de trajet (voiture) via OSRM public —
 * même source que la carte interactive admin.
 */

import { getMapOrigin } from "@/app/actions/settings"

const OSRM_BASE = "https://router.project-osrm.org"

/** Marge de conscience ajoutée au trajet brut OSRM (minutes). */
export const ETA_BUFFER_MIN = 3

export type DriveEtaResult = {
  /** Minutes brutes OSRM (trajet) */
  driveMin: number
  /** Minutes communiquées au client = ceil(drive) + buffer */
  etaMin: number
  distanceKm: number
}

/**
 * Temps de trajet depuis le point de départ admin (carte) jusqu'à la destination commande.
 * Retourne null si coords invalides ou OSRM indisponible.
 */
export async function estimateDriveEta(
  dest: { lat: number; lng: number },
  bufferMin: number = ETA_BUFFER_MIN,
): Promise<DriveEtaResult | null> {
  if (!Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) return null

  let origin: { lat: number; lng: number }
  try {
    origin = await getMapOrigin()
  } catch {
    return null
  }
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null

  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${origin.lng},${origin.lat};${dest.lng},${dest.lat}` +
    `?overview=false&steps=false`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as {
      code?: string
      routes?: Array<{ duration?: number; distance?: number }>
    }
    if (data.code !== "Ok" || !data.routes?.[0]) return null
    const route = data.routes[0]
    const driveMin = (route.duration ?? 0) / 60
    if (driveMin <= 0) return null
    const etaMin = Math.max(1, Math.ceil(driveMin) + Math.max(0, bufferMin))
    return {
      driveMin,
      etaMin,
      distanceKm: (route.distance ?? 0) / 1000,
    }
  } catch {
    return null
  }
}

/** Phrase prête pour le message client. */
export function formatEtaMessageLine(etaMin: number): string {
  if (etaMin < 60) {
    return `⏱ Temps de trajet estimé : environ ${etaMin} min.`
  }
  const h = Math.floor(etaMin / 60)
  const m = etaMin % 60
  const human = m ? `${h} h ${m} min` : `${h} h`
  return `⏱ Temps de trajet estimé : environ ${human}.`
}
