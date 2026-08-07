"use server"

import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc, and, gte } from "drizzle-orm"
import { headers } from "next/headers"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

// Géolocalise une IP (HTTPS gratuit — ip-api.com free n'accepte que HTTP,
// souvent bloqué en sortie serverless). Best-effort uniquement.
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
  ) {
    return empty
  }
  try {
    // ipwho.is : HTTPS gratuit, pas de clé, champs stables
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return empty
    const d = await res.json()
    if (d?.success === false) return empty
    return {
      city: d.city ?? null,
      country: d.country ?? null,
      countryCode: d.country_code ?? null,
      lat: typeof d.latitude === "number" ? d.latitude : null,
      lng: typeof d.longitude === "number" ? d.longitude : null,
    }
  } catch {
    return empty
  }
}

function extractClientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return h.get("x-real-ip")?.trim() || h.get("cf-connecting-ip")?.trim() || null
}

/** Anti-spam : une seule ligne par token dans cette fenêtre (reloads de session). */
const DEDUPE_MS = 2 * 60 * 1000

/**
 * Enregistre une connexion client.
 * IMPORTANT : l'INSERT est fait tout de suite (sans attendre la géoloc).
 * L'appelant DOIT await cette fonction — le fire-and-forget est tué par
 * Vercel/serverless dès que la server action renvoie sa réponse.
 */
export async function recordLogin(token: string) {
  try {
    const t = token?.trim()
    if (!t) return

    // Lire les headers AVANT tout await long (contexte requête encore valide).
    let ip: string | null = null
    let userAgent: string | null = null
    try {
      const h = await headers()
      ip = extractClientIp(h)
      userAgent = h.get("user-agent") ?? null
    } catch (e) {
      console.error("[login-logs] headers() indisponible:", e)
    }

    const row = await db
      .select({ pseudo: users.pseudo })
      .from(users)
      .where(eq(users.token, t))
      .limit(1)
    const pseudo = row[0]?.pseudo ?? "Inconnu"

    // Dédupliquer les rechargements de page (session restore) : max 1 log / 2 min / token
    const since = new Date(Date.now() - DEDUPE_MS)
    const recent = await db
      .select({ id: loginLogs.id })
      .from(loginLogs)
      .where(and(eq(loginLogs.userToken, t), gte(loginLogs.createdAt, since)))
      .limit(1)
    if (recent[0]) return

    // INSERT immédiat — ne dépend PAS de la géoloc (cause n°1 des logs « figés »)
    const inserted = await db
      .insert(loginLogs)
      .values({
        userToken: t,
        pseudo,
        ip,
        city: null,
        country: null,
        countryCode: null,
        lat: null,
        lng: null,
        userAgent,
      })
      .returning({ id: loginLogs.id })

    const logId = inserted[0]?.id
    if (!logId || !ip) return

    // Géoloc en second temps (best-effort) — l'INSERT est déjà en base
    const geo = await geolocate(ip)
    if (!geo.city && !geo.country) return

    await db
      .update(loginLogs)
      .set({
        city: geo.city,
        country: geo.country,
        countryCode: geo.countryCode,
        lat: geo.lat,
        lng: geo.lng,
      })
      .where(eq(loginLogs.id, logId))
  } catch (e) {
    // Ne jamais faire échouer la connexion, mais loguer pour le debug Vercel
    console.error("[login-logs] recordLogin failed:", e)
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
