"use server"

import { after } from "next/server"
import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc, and, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

type Geo = {
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number | null
  lng: number | null
}

const EMPTY_GEO: Geo = { city: null, country: null, countryCode: null, lat: null, lng: null }

/** Cache geo par IP (instance serverless) — évite de griller le quota ip-api 45/min. */
const geoCache = new Map<string, { geo: Geo; at: number }>()
const GEO_CACHE_MS = 10 * 60 * 1000

function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase()
  if (!v) return true
  if (v === "127.0.0.1" || v === "::1" || v === "0.0.0.0") return true
  if (v.startsWith("10.")) return true
  if (v.startsWith("192.168.")) return true
  if (v.startsWith("127.")) return true
  if (v.startsWith("169.254.")) return true
  // RFC1918 172.16.0.0/12 seulement — PAS tout 172.*
  const m172 = /^172\.(\d+)\./.exec(v)
  if (m172) {
    const n = Number(m172[1])
    if (n >= 16 && n <= 31) return true
  }
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7))
  return false
}

function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let ip = raw.trim()
  if (!ip) return null
  if (ip.startsWith("::ffff:")) ip = ip.slice(7)
  // "[2001:db8::1]" ou "2001:db8::1:port" IPv4 "1.2.3.4:port"
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]")
    if (end > 1) ip = ip.slice(1, end)
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, "")
  }
  return ip || null
}

/**
 * Même base que frenchycali (1er hop x-forwarded-for) + on saute les hops privés
 * et on prend x-vercel-forwarded-for si besoin.
 */
function clientIpFromHeaders(h: Headers): string | null {
  const candidates: string[] = []
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const ip = normalizeIp(part)
      if (ip) candidates.push(ip)
    }
  }
  for (const key of ["x-vercel-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip"]) {
    const ip = normalizeIp(h.get(key))
    if (ip) candidates.push(ip)
  }
  return candidates.find((ip) => !isPrivateIp(ip)) ?? candidates[0] ?? null
}

function geoFromVercelHeaders(h: Headers): Geo {
  const rawCity = h.get("x-vercel-ip-city")
  let city: string | null = null
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity)
    } catch {
      city = rawCity
    }
  }
  const code = h.get("x-vercel-ip-country")?.toUpperCase() || null
  let country: string | null = code
  if (code) {
    try {
      country = new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code
    } catch {
      country = code
    }
  }
  const lat = Number(h.get("x-vercel-ip-latitude"))
  const lng = Number(h.get("x-vercel-ip-longitude"))
  if (!city && !code) return EMPTY_GEO
  return {
    city,
    country,
    countryCode: code,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }
}

function geoHasLocation(g: Geo): boolean {
  return Boolean(g.city || g.country || g.countryCode)
}

/**
 * Copie frenchycali-full : GET http://ip-api.com/json/{ip}
 * IPv6 encodé (sinon WHATWG/fetch peut casser l’URL).
 */
async function geolocateIpApi(ip: string): Promise<Geo> {
  if (!ip || isPrivateIp(ip)) return EMPTY_GEO
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,city,regionName,country,countryCode,lat,lon`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) {
      console.error("[login-logs] ip-api HTTP", res.status, ip)
      return EMPTY_GEO
    }
    const d = (await res.json()) as {
      status?: string
      message?: string
      city?: string
      regionName?: string
      country?: string
      countryCode?: string
      lat?: number
      lon?: number
    }
    if (d.status !== "success") {
      console.error("[login-logs] ip-api fail", d.status, d.message, ip)
      return EMPTY_GEO
    }
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
  } catch (e) {
    console.error("[login-logs] ip-api error", ip, e instanceof Error ? e.message : e)
    return EMPTY_GEO
  }
}

async function geolocate(ip: string | null, vercelGeo: Geo): Promise<Geo> {
  if (!ip) return geoHasLocation(vercelGeo) ? vercelGeo : EMPTY_GEO
  const cached = geoCache.get(ip)
  if (cached && Date.now() - cached.at < GEO_CACHE_MS && geoHasLocation(cached.geo)) {
    return cached.geo
  }
  const fromApi = await geolocateIpApi(ip)
  const geo = geoHasLocation(fromApi) ? fromApi : vercelGeo
  if (geoHasLocation(geo)) geoCache.set(ip, { geo, at: Date.now() })
  return geo
}

async function persistLogin(
  token: string,
  ip: string | null,
  userAgent: string | null,
  vercelGeo: Geo,
) {
  let pseudo = "Inconnu"
  try {
    const row = await db
      .select({ pseudo: users.pseudo })
      .from(users)
      .where(eq(users.token, token))
      .limit(1)
    pseudo = row[0]?.pseudo ?? "Inconnu"
  } catch (e) {
    console.error("[login-logs] lookup pseudo failed:", e)
  }

  const geo = await geolocate(ip, vercelGeo)

  // Même token + même IP < 10 min : on ne spam pas le journal.
  // Si la ligne récente est vide, on la MET À JOUR (c’était le bug du dédup).
  try {
    const recent = await db
      .select()
      .from(loginLogs)
      .where(eq(loginLogs.userToken, token))
      .orderBy(desc(loginLogs.createdAt))
      .limit(1)
    const last = recent[0]
    if (last && last.ip === ip) {
      const age = Date.now() - new Date(last.createdAt).getTime()
      if (age >= 0 && age < 10 * 60 * 1000) {
        const lastEmpty = !last.city && !last.country && !last.countryCode
        if (lastEmpty && geoHasLocation(geo)) {
          await db
            .update(loginLogs)
            .set({
              city: geo.city,
              country: geo.country,
              countryCode: geo.countryCode,
              lat: geo.lat,
              lng: geo.lng,
              ip,
            })
            .where(eq(loginLogs.id, last.id))
        }
        return
      }
    }
  } catch (e) {
    console.error("[login-logs] recent lookup failed:", e)
  }

  await db.insert(loginLogs).values({
    userToken: token,
    pseudo,
    ip,
    city: geo.city,
    country: geo.country,
    countryCode: geo.countryCode,
    lat: geo.lat,
    lng: geo.lng,
    userAgent,
  })
}

/**
 * Enregistre une connexion. Les headers sont lus TOUT DE SUITE (contexte requête),
 * le fetch ip-api passe dans after() pour ne pas se faire tuer par Vercel.
 */
export async function recordLogin(token: string) {
  const t = token?.trim()
  if (!t) return

  let ip: string | null = null
  let userAgent: string | null = null
  let vercelGeo: Geo = EMPTY_GEO
  try {
    const h = await headers()
    ip = clientIpFromHeaders(h)
    userAgent = h.get("user-agent") ?? null
    vercelGeo = geoFromVercelHeaders(h)
  } catch (e) {
    console.error("[login-logs] headers() failed:", e)
  }

  const run = () =>
    persistLogin(t, ip, userAgent, vercelGeo).catch((e) => {
      console.error("[login-logs] persist failed:", e)
    })

  try {
    after(run)
  } catch {
    await run()
  }
}

/**
 * Enregistre l'heure de déconnexion sur la dernière session encore ouverte.
 * Soft total : ne bloque jamais la déconnexion client si ça échoue.
 */
export async function recordLogout(token: string) {
  try {
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

export async function listLoginLogs(limit = 200): Promise<LoginLogRow[]> {
  if (!(await isAdminAuthenticated())) return []
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

export async function deleteLoginLogsByToken(token: string) {
  try {
    await db.delete(loginLogs).where(eq(loginLogs.userToken, token))
  } catch (e) {
    console.error("[login-logs] deleteLoginLogsByToken failed:", e)
  }
}
