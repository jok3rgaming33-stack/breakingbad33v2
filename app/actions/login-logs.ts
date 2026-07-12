"use server"

import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Géolocalise une IP via ip-api.com (gratuit, pas de clé requise, 45 req/min).
async function geolocate(ip: string): Promise<{
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number | null
  lng: number | null
}> {
  const empty = { city: null, country: null, countryCode: null, lat: null, lng: null }
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  ) return empty
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country,countryCode,lat,lon`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return empty
    const d = await res.json()
    if (d.status !== "success") return empty
    return {
      city: d.city ?? null,
      country: d.country ?? null,
      countryCode: d.countryCode ?? null,
      lat: d.lat ?? null,
      lng: d.lon ?? null,
    }
  } catch {
    return empty
  }
}

// Enregistre une connexion client. Appelée côté serveur lors de getAccount().
// Fire-and-forget : les erreurs sont silencieuses pour ne pas bloquer le client.
export async function recordLogin(token: string) {
  try {
    const t = token?.trim()
    if (!t) return

    const h = await headers()

    // IP
    const forwarded = h.get("x-forwarded-for")
    const ip = (forwarded ? forwarded.split(",")[0]?.trim() : h.get("x-real-ip")?.trim()) ?? null

    // User-Agent
    const userAgent = h.get("user-agent") ?? null

    // Pseudo depuis la base
    const row = await db.select({ pseudo: users.pseudo }).from(users).where(eq(users.token, t)).limit(1)
    const pseudo = row[0]?.pseudo ?? "Inconnu"

    // Géolocalisation (non-bloquant, timeout 3s)
    const geo = ip ? await geolocate(ip) : { city: null, country: null, countryCode: null, lat: null, lng: null }

    await db.insert(loginLogs).values({
      userToken: t,
      pseudo,
      ip,
      city: geo.city,
      country: geo.country,
      countryCode: geo.countryCode,
      lat: geo.lat,
      lng: geo.lng,
      userAgent,
    })
  } catch {
    // Silencieux — ne jamais bloquer la connexion à cause du log
  }
}

export type LoginLogRow = {
  id: number
  userToken: string
  pseudo: string
  ip: string | null
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number | null
  lng: number | null
  userAgent: string | null
  createdAt: Date | string
}

// Retourne les N dernières connexions pour le panel admin.
export async function listLoginLogs(limit = 200): Promise<LoginLogRow[]> {
  if (!(await isAdminAuthenticated())) return []
  const rows = await db
    .select()
    .from(loginLogs)
    .orderBy(desc(loginLogs.createdAt))
    .limit(limit)
  return rows
}

// Supprime tous les logs d'un token donné (purge cascade, appelé par purgeUserData).
export async function deleteLoginLogsByToken(token: string) {
  await db.delete(loginLogs).where(eq(loginLogs.userToken, token))
}
