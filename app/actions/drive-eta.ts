"use server"

/**
 * Server action : ETA livraison depuis le point de départ carte (persisté).
 * En multi-arrêt, mets à jour le point de départ sur la carte interactive
 * avant de passer les commandes en « livraison ».
 */

import { getMapOrigin } from "@/app/actions/settings"
import {
  estimateDriveEtaBetween,
  ETA_BUFFER_MIN,
  type DriveEtaResult,
} from "@/lib/drive-eta"

export type { DriveEtaResult }

/**
 * ETA client pour une commande (coords lat/lng).
 * Retourne null si coords invalides.
 */
export async function getDeliveryEta(
  destLat: number,
  destLng: number,
  bufferMin: number = ETA_BUFFER_MIN,
): Promise<DriveEtaResult | null> {
  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) return null

  const origin = await getMapOrigin()
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null

  return estimateDriveEtaBetween(
    { lat: origin.lat, lng: origin.lng },
    { lat: destLat, lng: destLng },
    bufferMin,
  )
}

/**
 * ETA pour un thread de commande (lit lat/lng en base).
 */
export async function getDeliveryEtaForThread(
  threadId: number,
): Promise<(DriveEtaResult & { origin: { lat: number; lng: number } }) | null> {
  if (!threadId) return null
  try {
    const { db } = await import("@/lib/db")
    const { orderThreads } = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    const [row] = await db
      .select({ lat: orderThreads.lat, lng: orderThreads.lng, fulfillment: orderThreads.fulfillment })
      .from(orderThreads)
      .where(eq(orderThreads.id, threadId))
      .limit(1)
    if (!row) return null
    if (row.fulfillment !== "livraison") return null
    if (typeof row.lat !== "number" || typeof row.lng !== "number") return null

    const origin = await getMapOrigin()
    const eta = await estimateDriveEtaBetween(
      { lat: origin.lat, lng: origin.lng },
      { lat: row.lat, lng: row.lng },
    )
    if (!eta) return null
    return { ...eta, origin: { lat: origin.lat, lng: origin.lng } }
  } catch (e) {
    console.error("[getDeliveryEtaForThread]", e)
    return null
  }
}
