"use server"

/**
 * Server action : ETA livraison depuis le point de départ carte (persisté).
 * En multi-arrêt, mets à jour le point de départ sur la carte interactive
 * avant de passer les commandes en « livraison ».
 *
 * Ne pas ré-exporter de types depuis ce fichier ("use server" = fonctions async only).
 */

import { getMapOrigin } from "@/app/actions/settings"
import {
  estimateDriveEtaBetween,
  ETA_BUFFER_MIN,
  type DriveEtaResult,
} from "@/lib/drive-eta"

function asCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * ETA client pour des coords destination.
 */
export async function getDeliveryEta(
  destLat: number,
  destLng: number,
  bufferMin: number = ETA_BUFFER_MIN,
): Promise<DriveEtaResult | null> {
  const lat = asCoord(destLat)
  const lng = asCoord(destLng)
  if (lat == null || lng == null) return null

  const origin = await getMapOrigin()
  const oLat = asCoord(origin.lat)
  const oLng = asCoord(origin.lng)
  if (oLat == null || oLng == null) return null

  return estimateDriveEtaBetween(
    { lat: oLat, lng: oLng },
    { lat, lng },
    bufferMin,
  )
}

/**
 * Géocode une adresse (API adresse.data.gouv.fr) → lat/lng.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = address?.trim()
  if (!q) return null
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] }
        properties?: { label?: string }
      }>
    }
    const feature = data?.features?.[0]
    const coords = feature?.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    const [lng, lat] = coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      lat,
      lng,
      label: feature?.properties?.label ?? q,
    }
  } catch {
    return null
  }
}

/**
 * ETA pour un thread : lit lat/lng en base, sinon géocode l'adresse et persiste les coords.
 */
export async function getDeliveryEtaForThread(
  threadId: number,
): Promise<{
  etaMin: number
  driveMin: number
  distanceKm: number
  mode: "road" | "approx"
  origin: { lat: number; lng: number }
  usedGeocode: boolean
} | null> {
  if (!threadId) return null
  try {
    const { db } = await import("@/lib/db")
    const { orderThreads } = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")

    const [row] = await db
      .select({
        lat: orderThreads.lat,
        lng: orderThreads.lng,
        address: orderThreads.address,
        fulfillment: orderThreads.fulfillment,
      })
      .from(orderThreads)
      .where(eq(orderThreads.id, threadId))
      .limit(1)

    if (!row) return null
    if (row.fulfillment !== "livraison") return null

    let lat = asCoord(row.lat)
    let lng = asCoord(row.lng)
    let usedGeocode = false

    // Repli : géocoder l'adresse si pas de GPS (commandes admin, géocode panier échoué…)
    if ((lat == null || lng == null) && row.address?.trim()) {
      const geo = await geocodeAddress(row.address)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
        usedGeocode = true
        try {
          await db
            .update(orderThreads)
            .set({ lat: geo.lat, lng: geo.lng })
            .where(eq(orderThreads.id, threadId))
        } catch {
          /* non bloquant */
        }
      }
    }

    if (lat == null || lng == null) return null

    const origin = await getMapOrigin()
    const oLat = asCoord(origin.lat)
    const oLng = asCoord(origin.lng)
    if (oLat == null || oLng == null) return null

    const eta = await estimateDriveEtaBetween(
      { lat: oLat, lng: oLng },
      { lat, lng },
    )
    if (!eta) return null

    return {
      ...eta,
      origin: { lat: oLat, lng: oLng },
      usedGeocode,
    }
  } catch (e) {
    console.error("[getDeliveryEtaForThread]", e)
    return null
  }
}
