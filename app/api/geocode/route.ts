import { type NextRequest, NextResponse } from "next/server"

// Coordonnées GPS de référence (point de départ des livraisons)
const ORIGIN = { lat: 44.841575, lng: -0.581069 }

// Distance Haversine en km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim()

  if (!query) {
    return NextResponse.json({ error: "Adresse manquante" }, { status: 400 })
  }

  try {
    // API Adresse (Base Adresse Nationale) — gratuite, sans clé
    const url = `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { Accept: "application/json" } })

    if (!res.ok) {
      return NextResponse.json({ error: "Service de géocodage indisponible" }, { status: 502 })
    }

    const data = await res.json()
    const feature = data?.features?.[0]

    if (!feature) {
      return NextResponse.json({ found: false }, { status: 200 })
    }

    const [lng, lat] = feature.geometry.coordinates as [number, number]
    const distanceKm = haversineKm(ORIGIN.lat, ORIGIN.lng, lat, lng)

    return NextResponse.json({
      found: true,
      label: feature.properties?.label ?? query,
      lat,
      lng,
      distanceKm,
      score: feature.properties?.score ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Erreur lors du géocodage" }, { status: 500 })
  }
}
