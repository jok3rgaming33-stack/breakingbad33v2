"use server"

import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc, and, gte, isNull } from "drizzle-orm"
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

/** IPv4 mappée (::ffff:1.2.3.4) → 1.2.3.4 */
function normalizeIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, "")
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  return mapped?.[1] ?? ip
}

function isPrivateIp(ip: string): boolean {
  const v4 = normalizeIp(ip)
  if (!v4 || v4 === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true
  if (v4.startsWith("10.") || v4.startsWith("192.168.") || v4.startsWith("169.254.")) return true
  const m = /^172\.(\d+)\./.exec(v4)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  return false
}

function extractClientIp(h: Headers): string | null {
  const candidates = [
    h.get("x-real-ip"),
    h.get("x-vercel-forwarded-for")?.split(",")[0],
    h.get("cf-connecting-ip"),
    h.get("x-forwarded-for")?.split(",")[0],
  ]
  for (const raw of candidates) {
    const ip = raw?.trim()
    if (ip) return normalizeIp(ip)
  }
  return null
}

const ISO_COUNTRY: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  GB: "Royaume-Uni",
  NL: "Pays-Bas",
  PT: "Portugal",
  US: "États-Unis",
  CA: "Canada",
  MA: "Maroc",
  DZ: "Algérie",
  TN: "Tunisie",
}

/** Geo fournie par Vercel (IP réelle du visiteur, pas celle de la fonction). */
function geoFromVercelHeaders(h: Headers): Geo | null {
  const cityRaw = h.get("x-vercel-ip-city")
  const code = h.get("x-vercel-ip-country")
  const lat = h.get("x-vercel-ip-latitude")
  const lng = h.get("x-vercel-ip-longitude")
  if (!cityRaw && !code) return null
  let city: string | null = null
  if (cityRaw) {
    try {
      city = decodeURIComponent(cityRaw.replace(/\+/g, " "))
    } catch {
      city = cityRaw
    }
  }
  const countryCode = code?.toUpperCase() ?? null
  return {
    city,
    country: (countryCode && ISO_COUNTRY[countryCode]) || countryCode,
    countryCode,
    lat: lat != null && lat !== "" ? Number(lat) : null,
    lng: lng != null && lng !== "" ? Number(lng) : null,
  }
}

async function fetchJson(url: string, ms: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Même stratégie que LaCentral : géoloc AVANT l'insert (pas en fire-and-forget).
 * Sur Vercel, un `void enrich()` après le return de l'action est tué → ville toujours vide.
 * ipwho.is (HTTPS) puis repli ip-api.com (celui qui marche déjà sur LaCentral).
 */
async function geolocate(ip: string): Promise<Geo> {
  if (!ip || isPrivateIp(ip)) return EMPTY_GEO
  const enc = encodeURIComponent(ip)

  const who = (await fetchJson(`https://ipwho.is/${enc}`, 3000)) as {
    success?: boolean
    city?: string
    country?: string
    country_code?: string
    latitude?: number
    longitude?: number
  } | null
  if (who && who.success !== false && (who.city || who.country)) {
    return {
      city: who.city ?? null,
      country: who.country ?? null,
      countryCode: who.country_code ?? null,
      lat: typeof who.latitude === "number" ? who.latitude : null,
      lng: typeof who.longitude === "number" ? who.longitude : null,
    }
  }

  const apiCo = (await fetchJson(`https://ipapi.co/${enc}/json/`, 3000)) as {
    error?: boolean
    city?: string
    country_name?: string
    country?: string
    latitude?: number
    longitude?: number
  } | null
  if (apiCo && !apiCo.error && (apiCo.city || apiCo.country_name)) {
    return {
      city: apiCo.city ?? null,
      country: apiCo.country_name ?? null,
      countryCode: apiCo.country ?? null,
      lat: typeof apiCo.latitude === "number" ? apiCo.latitude : null,
      lng: typeof apiCo.longitude === "number" ? apiCo.longitude : null,
    }
  }

  const api = (await fetchJson(
    `http://ip-api.com/json/${enc}?fields=status,city,country,countryCode,lat,lon`,
    3000,
  )) as {
    status?: string
    city?: string
    country?: string
    countryCode?: string
    lat?: number
    lon?: number
  } | null
  if (api && api.status === "success") {
    return {
      city: api.city ?? null,
      country: api.country ?? null,
      countryCode: api.countryCode ?? null,
      lat: typeof api.lat === "number" ? api.lat : null,
      lng: typeof api.lon === "number" ? api.lon : null,
    }
  }

  return EMPTY_GEO
}

/** Anti-spam : une seule ligne par token dans cette fenêtre (reloads de session). */
const DEDUPE_MS = 2 * 60 * 1000

/**
 * Best-effort : ne doit JAMAIS lever d'exception vers l'appelant.
 * Géoloc synchrone (comme LaCentral) : ville/pays écrits dans le même INSERT.
 */
export async function recordLogin(token: string) {
  try {
    // Schema soft — ne doit pas faire échouer le journal ni la connexion
    try {
      await ensureFeatureSchema()
    } catch {
      /* soft */
    }

    const t = token?.trim()
    if (!t) return

    // Lire les headers AVANT tout await long (contexte requête encore valide).
    let ip: string | null = null
    let userAgent: string | null = null
    let headerGeo: Geo | null = null
    try {
      const h = await headers()
      ip = extractClientIp(h)
      userAgent = h.get("user-agent") ?? null
      headerGeo = geoFromVercelHeaders(h)
    } catch (e) {
      console.error("[login-logs] headers() indisponible:", e)
    }

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

    // Dédupliquer les rechargements (session encore ouverte) : max 1 log / 2 min / token.
    // Fallback sans loggedOutAt si la colonne n'est pas encore dispo.
    const since = new Date(Date.now() - DEDUPE_MS)
    try {
      let recent: { id: number }[] = []
      try {
        recent = await db
          .select({ id: loginLogs.id })
          .from(loginLogs)
          .where(
            and(
              eq(loginLogs.userToken, t),
              gte(loginLogs.createdAt, since),
              isNull(loginLogs.loggedOutAt),
            ),
          )
          .limit(1)
      } catch {
        recent = await db
          .select({ id: loginLogs.id })
          .from(loginLogs)
          .where(and(eq(loginLogs.userToken, t), gte(loginLogs.createdAt, since)))
          .limit(1)
      }
      if (recent[0]) return
    } catch (e) {
      // Table absente / erreur DB → on tente quand même l'INSERT ci-dessous
      console.error("[login-logs] dedupe failed:", e)
    }

    const geo =
      headerGeo && (headerGeo.city || headerGeo.country)
        ? headerGeo
        : ip
          ? await geolocate(ip)
          : EMPTY_GEO

    try {
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
      console.error("[login-logs] insert failed:", e)
    }
  } catch (e) {
    // Ne jamais faire échouer la connexion
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
