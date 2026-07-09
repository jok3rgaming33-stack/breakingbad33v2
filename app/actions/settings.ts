"use server"

import { db } from "@/lib/db"
import { appSettings } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

// Point de départ servant au calcul des distances de livraison.
export type MapOrigin = { lat: number; lng: number; label?: string }

// Contenu éditable de la modale "Livraison & Meet-up".
export type LogisticsContent = {
  deliveryTitle: string
  deliveryBody: string
  meetupTitle: string
  meetupBody: string
  note?: string
}

// Créneau de livraison : plage horaire (startHour/endHour en 24h, endHour<=startHour = passe minuit).
// days = jours actifs (["Lundi","Mardi"…]) — vide/absent = tous les jours.
export type DeliverySlot = { id: string; label: string; startHour: number; endHour: number; days?: string[] }
// Créneau de meet-up : heure de retrait unique (24h).
// days = jours actifs — vide/absent = tous les jours.
export type MeetupSlot = { id: string; label: string; hour: number; days?: string[] }
// Configuration éditable des créneaux du panier.
export type CartConfig = {
  minDeliveryAmount: number
  deliverySlots: DeliverySlot[]
  meetupSlots: MeetupSlot[]
}

const DEFAULT_ORIGIN: MapOrigin = { lat: 44.8378, lng: -0.5792, label: "Bordeaux centre" }

const DEFAULT_LOGISTICS: LogisticsContent = {
  deliveryTitle: "Livraison à domicile",
  deliveryBody:
    "Livraison discrète à l'adresse de ton choix. Le livreur te contacte à l'approche. Reste joignable pour faciliter la remise.",
  meetupTitle: "Meet-up (point de retrait)",
  meetupBody:
    "Retrouve-nous à un point de rendez-vous convenu. Choisis une date et un créneau horaire lors de la commande.",
  note: "Les frais et délais peuvent varier selon ta zone et la distance depuis notre point de départ.",
}

const DEFAULT_CART_CONFIG: CartConfig = {
  minDeliveryAmount: 50,
  deliverySlots: [
    { id: "d1", label: "14H - 17H", startHour: 14, endHour: 17 },
    { id: "d2", label: "18H - 20H", startHour: 18, endHour: 20 },
    { id: "d3", label: "21H - 02H", startHour: 21, endHour: 2 },
  ],
  meetupSlots: [
    { id: "m14", label: "14H", hour: 14 },
    { id: "m15", label: "15H", hour: 15 },
    { id: "m16", label: "16H", hour: 16 },
    { id: "m17", label: "17H", hour: 17 },
    { id: "m18", label: "18H", hour: 18 },
    { id: "m19", label: "19H", hour: 19 },
    { id: "m20", label: "20H", hour: 20 },
    { id: "m21", label: "21H", hour: 21 },
    { id: "m22", label: "22H", hour: 22 },
    { id: "m23", label: "23H", hour: 23 },
    { id: "m00", label: "00H", hour: 0 },
  ],
}

// Lit une valeur de réglage typée, avec valeur par défaut.
async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  if (rows.length === 0) return fallback
  return { ...fallback, ...(rows[0].value as object) } as T
}

async function writeSetting(key: string, value: Record<string, unknown>) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
}

export async function getMapOrigin(): Promise<MapOrigin> {
  return readSetting<MapOrigin>("map_origin", DEFAULT_ORIGIN)
}

export async function setMapOrigin(origin: MapOrigin) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const lat = Number(origin.lat)
  const lng = Number(origin.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false as const, error: "Coordonnées invalides." }
  await writeSetting("map_origin", { lat, lng, label: origin.label?.trim() || "" })
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function getCartConfig(): Promise<CartConfig> {
  return readSetting<CartConfig>("cart_config", DEFAULT_CART_CONFIG)
}

export async function setCartConfig(config: CartConfig) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }

  const min = Number(config.minDeliveryAmount)
  if (!Number.isFinite(min) || min < 0) return { ok: false as const, error: "Montant minimum invalide." }

  const clampHour = (h: unknown) => {
    const n = Math.trunc(Number(h))
    return Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : 0
  }

  const deliverySlots: DeliverySlot[] = (config.deliverySlots ?? [])
    .map((s, i) => ({
      id: s.id?.trim() || `d${i}-${Date.now()}`,
      label: s.label?.trim() || "",
      startHour: clampHour(s.startHour),
      endHour: clampHour(s.endHour),
    }))
    .filter((s) => s.label.length > 0)

  const meetupSlots: MeetupSlot[] = (config.meetupSlots ?? [])
    .map((s, i) => ({
      id: s.id?.trim() || `m${i}-${Date.now()}`,
      label: s.label?.trim() || "",
      hour: clampHour(s.hour),
    }))
    .filter((s) => s.label.length > 0)

  await writeSetting("cart_config", { minDeliveryAmount: min, deliverySlots, meetupSlots })
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function getLogisticsContent(): Promise<LogisticsContent> {
  return readSetting<LogisticsContent>("logistics_content", DEFAULT_LOGISTICS)
}

export async function setLogisticsContent(content: LogisticsContent) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await writeSetting("logistics_content", {
    deliveryTitle: content.deliveryTitle?.trim() || DEFAULT_LOGISTICS.deliveryTitle,
    deliveryBody: content.deliveryBody?.trim() || DEFAULT_LOGISTICS.deliveryBody,
    meetupTitle: content.meetupTitle?.trim() || DEFAULT_LOGISTICS.meetupTitle,
    meetupBody: content.meetupBody?.trim() || DEFAULT_LOGISTICS.meetupBody,
    note: content.note?.trim() || "",
  })
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}
