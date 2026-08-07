"use server"

import { db } from "@/lib/db"
import { loginLogs, users } from "@/lib/db/schema"
import { eq, desc, and, gte, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { ensureFeatureSchema } from "@/lib/feature-schema"

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
      signal: AbortSignal.timeout(2000),
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
 * Best-effort : ne doit JAMAIS lever d'exception vers l'appelant.
 * Ne doit pas bloquer la connexion : l'INSERT est prioritaire, la géoloc est secondaire.
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
    try {
      const h = await headers()
      ip = extractClientIp(h)
      userAgent = h.get("user-agent") ?? null
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

    // INSERT immédiat — ne dépend PAS de la géoloc
    let logId: number | undefined
    try {
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
      logId = inserted[0]?.id
    } catch (e) {
      console.error("[login-logs] insert failed:", e)
      return
    }

    // Géoloc en arrière-plan : ne bloque PAS le retour de la server action
    // (évite d'ajouter jusqu'à 2s de latence à chaque connexion membre).
    if (logId && ip) {
      void enrichLoginGeo(logId, ip)
    }
  } catch (e) {
    // Ne jamais faire échouer la connexion
    console.error("[login-logs] recordLogin failed:", e)
  }
}

async function enrichLoginGeo(logId: number, ip: string) {
  try {
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
    console.error("[login-logs] geo enrich failed:", e)
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
