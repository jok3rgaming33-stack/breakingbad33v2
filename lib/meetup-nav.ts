export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function destParam(lat: number | null | undefined, lng: number | null | undefined, address: string) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { ll: `${lat},${lng}`, q: address.trim() }
  }
  return { ll: null, q: address.trim() }
}

/** Navigation Waze jusqu'au point. */
export function wazeNavUrl(
  address: string,
  lat?: number | null,
  lng?: number | null,
): string {
  const d = destParam(lat, lng, address)
  if (d.ll) return `https://waze.com/ul?ll=${d.ll}&navigate=yes`
  return `https://waze.com/ul?q=${encodeURIComponent(d.q)}&navigate=yes`
}

/**
 * Maps : Apple Maps sur iOS, Google Maps ailleurs.
 */
export function mapsNavUrl(
  address: string,
  lat?: number | null,
  lng?: number | null,
): string {
  const d = destParam(lat, lng, address)
  const isiOS =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (isiOS) {
    if (d.ll) return `https://maps.apple.com/?daddr=${d.ll}&dirflg=d`
    return `https://maps.apple.com/?daddr=${encodeURIComponent(d.q)}&dirflg=d`
  }
  if (d.ll) {
    return `https://www.google.com/maps/dir/?api=1&destination=${d.ll}&travelmode=driving`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.q)}&travelmode=driving`
}

export function formatDistanceKm(km: number): string {
  if (km < 0.12) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function formatAgeSec(atIso: string, now = Date.now()): string {
  const ms = now - new Date(atIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "à l'instant"
  const s = Math.round(ms / 1000)
  if (s < 8) return "à l'instant"
  if (s < 60) return `il y a ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  return `il y a ${Math.round(m / 60)} h`
}
