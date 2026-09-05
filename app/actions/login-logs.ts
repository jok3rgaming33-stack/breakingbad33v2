"use server"

import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc, and, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { ensureFeatureSchema } from "@/lib/feature-schema"

type Geo = {
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number | null
  lng: number | null
}

const EMPTY_GEO: Geo = { city: null, country: null, countryCode: null, lat: null, lng: null }

/**
 * Copie conforme de frenchycali-full :
 * - IP = 1er hop de x-forwarded-for (sinon x-real-ip)
 * - géoloc = http://ip-api.com (IP brute, non encodée)
 * - await geo PUIS insert (jamais en fire-and-forget)
 */
async function geolocate(ip: string): Promise<Geo> {
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  ) {
    return EMPTY_GEO
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,countryCode,lat,lon`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    )
    if (!res.ok) return EMPTY_GEO
    const d = await res.json()
    if (d.status !== "success") return EMPTY_GEO
    const city =
      d.city && d.regionName && d.city !== d.regionName
        ? `${d.city} (${d.regionName})`
        : (d.city ?? d.regionName ?? null)
    return {
      city,
      country: d.country ?? null,
      countryCode: d.countryCode ?? null,
      lat: d.lat ?? null,
      lng: d.lon ?? null,
    }
  } catch {
    return EMPTY_GEO
  }
}

/**
 * Best-effort : ne doit JAMAIS lever d'exception vers l'appelant.
 * Flux identique à frenchycali-full / LaCentral.
 */
export async function recordLogin(token: string) {
  try {
    try {
      await ensureFeatureSchema()
    } catch {
      /* soft */
    }

    const t = token?.trim()
    if (!t) return

    const h = await headers()
    const forwarded = h.get("x-forwarded-for")
    const ip = (forwarded ? forwarded.split(",")[0]?.trim() : h.get("x-real-ip")?.trim()) ?? null
    const userAgent = h.get("user-agent") ?? null

    let pseudo = "Inconnu"
    try {
      const row = await db
        .select({ pseudo: users.pseudo })
        .from(users)
        .where(eq(users.token, t))
        .limit(1)
      pseudo = row[0]?.pseudo ?? "Inconnu"
    } catch (e) {
      console.error("[login-logs] lookup pseudo failed:", e)
    }

    const geo = ip ? await geolocate(ip) : EMPTY_GEO

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
  } catch (e) {
    console.error("[login-logs] recordLogin failed:", e)
  }
}

/**
 * Enregistre l'heure de déconnexion sur la dernière session encore ouverte.
 * Soft total : ne bloque jamais la déconnexion client si ça échoue.
 */
export async function recordLogout(token: string) {
  try {
    try {
      await ensureFeatureSchema()
    } catch {
      /* soft */
    }

    const t = token?.trim()
    if (!t) return

    let open: { id: number }[] = []
    try {
      open = await db
        .select({ id: loginLogs.id })
        .from(loginLogs)
        .where(and(eq(loginLogs.userToken, t), isNull(loginLogs.loggedOutAt)))
        .orderBy(desc(loginLogs.createdAt))
        .limit(1)
    } catch {
      // Colonne absente → on marque simplement le log le plus récent
      try {
        open = await db
          .select({ id: loginLogs.id })
          .from(loginLogs)
          .where(eq(loginLogs.userToken, t))
          .orderBy(desc(loginLogs.createdAt))
          .limit(1)
      } catch (e) {
        console.error("[login-logs] recordLogout select failed:", e)
        return
      }
    }

    if (!open[0]) return

    try {
      await db
        .update(loginLogs)
        .set({ loggedOutAt: new Date() })
        .where(eq(loginLogs.id, open[0].id))
    } catch (e) {
      console.error("[login-logs] recordLogout update failed:", e)
    }
  } catch (e) {
    console.error("[login-logs] recordLogout failed:", e)
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
  loggedOutAt: Date | string | null
}

// Retourne les N dernières connexions pour le panel admin.
export async function listLoginLogs(limit = 200): Promise<LoginLogRow[]> {
  if (!(await isAdminAuthenticated())) return []
  try {
    await ensureFeatureSchema()
  } catch {
    /* soft */
  }
  try {
    const rows = await db
      .select()
      .from(loginLogs)
      .orderBy(desc(loginLogs.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      ...r,
      loggedOutAt: (r as LoginLogRow).loggedOutAt ?? null,
    }))
  } catch (e) {
    console.error("[login-logs] listLoginLogs failed:", e)
    return []
  }
}

// Supprime tous les logs d'un token donné (purge cascade, appelé par purgeUserData).
export async function deleteLoginLogsByToken(token: string) {
  try {
    await db.delete(loginLogs).where(eq(loginLogs.userToken, token))
  } catch (e) {
    console.error("[login-logs] deleteLoginLogsByToken failed:", e)
  }
}
