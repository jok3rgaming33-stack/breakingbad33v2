"use server"

import { db } from "@/lib/db"
import { orderThreads } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { updateThreadStatus } from "@/app/actions/messaging"
import { geocodeAddress } from "@/app/actions/drive-eta"
import { haversineKm } from "@/lib/meetup-nav"
import { isRateLimited } from "@/lib/rate-limit"
import { normalizeStatus } from "@/lib/order-status"

type Tracking = NonNullable<(typeof orderThreads.$inferSelect)["tracking"]>

function asTracking(raw: unknown): Tracking {
  return raw && typeof raw === "object" ? (raw as Tracking) : {}
}

/**
 * Passe un meet-up en « colis prêt » avec l'adresse de rendez-vous (géocodée).
 */
export async function setMeetupReady(
  threadId: number,
  address: string,
): Promise<{ ok: true; label: string; lat: number | null; lng: number | null } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  const addr = address.trim()
  if (addr.length < 4) return { ok: false, error: "Saisis une adresse de rendez-vous." }

  const [row] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId)).limit(1)
  if (!row) return { ok: false, error: "Commande introuvable." }
  if ((row.fulfillment || "").toLowerCase() !== "meetup") {
    return { ok: false, error: "Cette commande n'est pas un meet-up." }
  }

  const geo = await geocodeAddress(addr)
  const label = geo?.label ?? addr
  const lat = geo?.lat ?? null
  const lng = geo?.lng ?? null

  const tracking: Tracking = {
    ...asTracking(row.tracking),
    meetup: { address: label, lat, lng },
  }

  await db
    .update(orderThreads)
    .set({
      address: label,
      lat,
      lng,
      tracking,
    })
    .where(eq(orderThreads.id, threadId))

  const st = await updateThreadStatus(threadId, "pret_meetup")
  if (!st || (typeof st === "object" && "ok" in st && st.ok === false)) {
    return { ok: false, error: "Adresse enregistrée mais le statut n'a pas pu être mis à jour." }
  }

  return { ok: true, label, lat, lng }
}

/**
 * Ping GPS client (opt-in) pendant un meet-up « colis prêt ».
 */
export async function pingMeetupLocation(
  threadId: number,
  customerToken: string,
  lat: number,
  lng: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = customerToken?.trim()
  if (!threadId || !token) return { ok: false, error: "Session invalide." }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "Position invalide." }
  }

  const key = `meetup-ping:${threadId}:${token.slice(0, 12)}`
  if (isRateLimited(key, 8, 60_000)) {
    return { ok: true }
  }

  const [row] = await db
    .select()
    .from(orderThreads)
    .where(and(eq(orderThreads.id, threadId), eq(orderThreads.customerToken, token)))
    .limit(1)
  if (!row) return { ok: false, error: "Commande introuvable." }
  if ((row.fulfillment || "").toLowerCase() !== "meetup") {
    return { ok: false, error: "Pas un meet-up." }
  }
  const st = normalizeStatus(row.status)
  if (st !== "pret_meetup") {
    return { ok: false, error: "Le rendez-vous n'est plus actif." }
  }

  const tracking: Tracking = {
    ...asTracking(row.tracking),
    clientLive: { lat, lng, at: new Date().toISOString() },
  }
  await db.update(orderThreads).set({ tracking }).where(eq(orderThreads.id, threadId))
  return { ok: true }
}

export async function getMeetupLive(threadId: number): Promise<{
  address: string | null
  lat: number | null
  lng: number | null
  client: { lat: number; lng: number; at: string } | null
  distanceKm: number | null
} | null> {
  if (!(await isAdminAuthenticated())) return null
  const [row] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId)).limit(1)
  if (!row) return null
  const t = asTracking(row.tracking)
  const meetup = t.meetup
  const address = meetup?.address ?? row.address ?? null
  const lat = meetup?.lat ?? row.lat ?? null
  const lng = meetup?.lng ?? row.lng ?? null
  const client = t.clientLive ?? null
  let distanceKm: number | null = null
  if (client && lat != null && lng != null) {
    distanceKm = haversineKm({ lat, lng }, { lat: client.lat, lng: client.lng })
  }
  return { address, lat, lng, client, distanceKm }
}
