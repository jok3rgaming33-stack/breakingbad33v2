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
