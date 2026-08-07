"use server"

import { createHash, randomBytes } from "crypto"
import { headers } from "next/headers"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { isoBase64URL } from "@simplewebauthn/server/helpers"
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, webauthnChallenges, webauthnCredentials } from "@/lib/db/schema"

const CHALLENGE_TTL_MS = 5 * 60 * 1000

let schemaReady = false

/**
 * Crée les tables si absentes.
 * Ne doit JAMAIS faire planter le login clé : en cas d'échec DB on renvoie false.
 */
export async function ensureWebAuthnSchema(): Promise<boolean> {
  if (schemaReady) return true
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id SERIAL PRIMARY KEY,
        user_token TEXT NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT,
        device_label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS webauthn_credentials_user_token_idx
      ON webauthn_credentials (user_token)
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        user_token TEXT,
        purpose TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    try {
      await db.execute(sql`DELETE FROM webauthn_challenges WHERE expires_at < NOW()`)
    } catch {
      /* non bloquant */
    }
    schemaReady = true
    return true
  } catch (e) {
    console.error("[webauthn] ensureSchema failed:", e)
    schemaReady = false
    return false
  }
}

/**
 * Calcule rpID + origins à partir de la requête courante + env.
 * Plus stable multi-domaine (www / apex / preview) que l'env seule.
 */
async function getWebAuthnConfig(): Promise<{
  rpID: string
  rpName: string
  origins: string[]
}> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.breakingbad33.com"
  const origins = new Set<string>()
  let envHost = "www.breakingbad33.com"

  try {
    const u = new URL(siteUrl)
    envHost = u.hostname
    origins.add(u.origin)
  } catch {
    origins.add("https://www.breakingbad33.com")
  }

  // Origine réelle de la requête (Vercel / reverse proxy)
  try {
    const h = await headers()
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()
    const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim()
    if (host) {
      origins.add(`${proto}://${host}`)
      // Sans port si présent
      const hostNoPort = host.replace(/:\d+$/, "")
      if (hostNoPort !== host) origins.add(`${proto}://${hostNoPort}`)
    }
  } catch {
    /* headers() hors requête — ignore */
  }

  const primaryHost = (() => {
    try {
      const h = [...origins][0]
      return new URL(h).hostname
    } catch {
      return envHost
    }
  })()

  const isLocal =
    primaryHost === "localhost" ||
    primaryHost === "127.0.0.1" ||
    envHost === "localhost" ||
    process.env.NODE_ENV === "development"

  let rpID = primaryHost.replace(/:\d+$/, "")
  if (!isLocal) {
    const parts = rpID.split(".")
    // eTLD+1 : breakingbad33.com (couvre www + apex)
    if (parts.length >= 2) rpID = parts.slice(-2).join(".")
  } else {
    rpID = "localhost"
    origins.add("http://localhost:3000")
    origins.add("http://127.0.0.1:3000")
  }

  if (!isLocal) {
    origins.add(`https://${rpID}`)
    origins.add(`https://www.${rpID}`)
  }

  return {
    rpID,
    rpName: "BreakingBad33",
    origins: [...origins],
  }
}

function tokenToUserId(token: string): Uint8Array<ArrayBuffer> {
  const buf = createHash("sha256").update(token).digest()
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return out
}

async function saveChallenge(input: {
  challenge: string
  purpose: "registration" | "authentication"
  userToken?: string | null
}): Promise<string | null> {
  try {
    const id = randomBytes(16).toString("hex")
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
    await db.insert(webauthnChallenges).values({
      id,
      challenge: input.challenge,
      purpose: input.purpose,
      userToken: input.userToken ?? null,
      expiresAt,
    })
    return id
  } catch (e) {
    console.error("[webauthn] saveChallenge:", e)
    return null
  }
}

async function consumeChallenge(
  challengeId: string,
  purpose: "registration" | "authentication",
): Promise<{ challenge: string; userToken: string | null } | null> {
  try {
    const rows = await db
      .select()
      .from(webauthnChallenges)
      .where(eq(webauthnChallenges.id, challengeId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    // Supprime toujours pour éviter réutilisation
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId))
    if (row.purpose !== purpose) return null
    if (new Date(row.expiresAt).getTime() < Date.now()) return null
    return { challenge: row.challenge, userToken: row.userToken }
  } catch (e) {
    console.error("[webauthn] consumeChallenge:", e)
    return null
  }
}

function parseTransports(raw: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AuthenticatorTransportFuture[]
  return list.length ? list : undefined
}

const SOFT_FAIL = {
  schema: "Déverrouillage biométrique temporairement indisponible. Utilise ta clé secrète.",
  generic: "Biométrie indisponible. Utilise ta clé secrète.",
} as const

// ─── Registration ───────────────────────────────────────────────────────────

export async function startWebAuthnRegistration(userToken: string): Promise<
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }
  | { ok: false; error: string }
> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    const token = userToken?.trim()
    if (!token || token.length < 20) {
      return { ok: false, error: "Session invalide. Reconnecte-toi avec ta clé." }
    }

    const account = await db.select().from(users).where(eq(users.token, token)).limit(1)
    if (!account[0]) {
      return { ok: false, error: "Compte introuvable. Reconnecte-toi avec ta clé." }
    }

    const { rpID, rpName } = await getWebAuthnConfig()
    let existing: (typeof webauthnCredentials.$inferSelect)[] = []
    try {
      existing = await db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userToken, token))
    } catch {
      existing = []
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: account[0].pseudo,
      userDisplayName: account[0].pseudo,
      userID: tokenToUserId(token),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: parseTransports(c.transports),
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "required",
      },
      preferredAuthenticatorType: "localDevice",
    })

    const challengeId = await saveChallenge({
      challenge: options.challenge,
      purpose: "registration",
      userToken: token,
    })
    if (!challengeId) return { ok: false, error: SOFT_FAIL.schema }

    return { ok: true, options, challengeId }
  } catch (e) {
    console.error("[webauthn] startRegistration:", e)
    return { ok: false, error: SOFT_FAIL.generic }
  }
}

export async function finishWebAuthnRegistration(input: {
  userToken: string
  challengeId: string
  response: RegistrationResponseJSON
  deviceLabel?: string
}): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    const token = input.userToken?.trim()
    if (!token || !input.challengeId || !input.response) {
      return { ok: false, error: "Données manquantes. Réessaie ou utilise ta clé." }
    }

    const stored = await consumeChallenge(input.challengeId, "registration")
    if (!stored || stored.userToken !== token) {
      return { ok: false, error: "Délai dépassé. Réessaie l'activation." }
    }

    const { rpID, origins } = await getWebAuthnConfig()
    const verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: stored.challenge,
      expectedOrigin: origins,
      expectedRPID: [rpID],
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false, error: "Activation refusée par l'appareil. Réessaie ou utilise ta clé." }
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey)
    const transports =
      input.response.response.transports?.join(",") ??
      credential.transports?.join(",") ??
      null

    await db.delete(webauthnCredentials).where(eq(webauthnCredentials.credentialId, credential.id))

    await db.insert(webauthnCredentials).values({
      userToken: token,
      credentialId: credential.id,
      publicKey: publicKeyB64,
      counter: credential.counter ?? 0,
      transports,
      deviceLabel:
        input.deviceLabel?.trim().slice(0, 80) ||
        `${credentialDeviceType}${credentialBackedUp ? "+backup" : ""}`,
    })

    return { ok: true, credentialId: credential.id }
  } catch (e) {
    console.error("[webauthn] finishRegistration:", e)
    return { ok: false, error: "Activation impossible. Tu peux toujours te connecter avec ta clé." }
  }
}

// ─── Authentication ─────────────────────────────────────────────────────────

export async function startWebAuthnAuthentication(credentialIds?: string[]): Promise<
  | { ok: true; options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }
  | { ok: false; error: string; clearLocal?: boolean }
> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    const { rpID } = await getWebAuthnConfig()

    let allowCredentials:
      | { id: string; transports?: AuthenticatorTransportFuture[] }[]
      | undefined

    if (credentialIds && credentialIds.length > 0) {
      try {
        const rows = await db.select().from(webauthnCredentials)
        const set = new Set(credentialIds)
        allowCredentials = rows
          .filter((r) => set.has(r.credentialId))
          .map((r) => ({
            id: r.credentialId,
            transports: parseTransports(r.transports),
          }))
      } catch {
        allowCredentials = undefined
      }

      // Credentials locaux obsolètes (compte purgé / autre appareil) → demander clé
      if (!allowCredentials || allowCredentials.length === 0) {
        return {
          ok: false,
          clearLocal: true,
          error:
            "Déverrouillage biométrique expiré sur cet appareil. Connecte-toi avec ta clé secrète (puis réactive si tu veux).",
        }
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials:
        allowCredentials && allowCredentials.length > 0 ? allowCredentials : undefined,
    })

    const challengeId = await saveChallenge({
      challenge: options.challenge,
      purpose: "authentication",
    })
    if (!challengeId) return { ok: false, error: SOFT_FAIL.schema }

    return { ok: true, options, challengeId }
  } catch (e) {
    console.error("[webauthn] startAuthentication:", e)
    return { ok: false, error: SOFT_FAIL.generic }
  }
}

export async function finishWebAuthnAuthentication(input: {
  challengeId: string
  response: AuthenticationResponseJSON
}): Promise<
  | { ok: true; token: string; pseudo: string }
  | { ok: false; error: string; clearLocal?: boolean }
> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    if (!input.challengeId || !input.response?.id) {
      return { ok: false, error: "Données manquantes. Utilise ta clé secrète." }
    }

    const stored = await consumeChallenge(input.challengeId, "authentication")
    if (!stored) {
      return { ok: false, error: "Délai dépassé. Réessaie ou utilise ta clé secrète." }
    }

    const credRows = await db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.credentialId, input.response.id))
      .limit(1)
    const cred = credRows[0]
    if (!cred) {
      return {
        ok: false,
        clearLocal: true,
        error: "Identifiant biométrique inconnu. Connecte-toi avec ta clé secrète.",
      }
    }

    const account = await db.select().from(users).where(eq(users.token, cred.userToken)).limit(1)
    if (!account[0]) {
      try {
        await db
          .delete(webauthnCredentials)
          .where(eq(webauthnCredentials.credentialId, cred.credentialId))
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        clearLocal: true,
        error: "Compte introuvable. Utilise ta clé secrète.",
      }
    }

    const { rpID, origins } = await getWebAuthnConfig()

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: stored.challenge,
        expectedOrigin: origins,
        expectedRPID: [rpID],
        credential: {
          id: cred.credentialId,
          publicKey: isoBase64URL.toBuffer(cred.publicKey),
          // Counter 0 sur beaucoup d'authentificateurs platform — on tolère via stored value
          counter: Math.max(0, cred.counter ?? 0),
          transports: parseTransports(cred.transports),
        },
        requireUserVerification: true,
      })
    } catch (verifyErr) {
      console.error("[webauthn] verifyAuthenticationResponse:", verifyErr)
      return {
        ok: false,
        error: "Vérification refusée. Utilise ta clé secrète, puis réactive la biométrie si besoin.",
      }
    }

    if (!verification.verified) {
      return {
        ok: false,
        error: "Vérification biométrique échouée. Utilise ta clé secrète.",
      }
    }

    // Met à jour le compteur seulement s'il a progressé (évite corruptions)
    const newCounter = verification.authenticationInfo.newCounter
    if (typeof newCounter === "number" && newCounter >= (cred.counter ?? 0)) {
      try {
        await db
          .update(webauthnCredentials)
          .set({ counter: newCounter })
          .where(eq(webauthnCredentials.credentialId, cred.credentialId))
      } catch {
        /* non bloquant pour la connexion */
      }
    }

    // Journal des connexions (biométrie ne passait pas par getAccount — logs figés)
    try {
      const { recordLogin } = await import("@/app/actions/login-logs")
      await recordLogin(account[0].token)
    } catch {
      /* non bloquant */
    }

    return {
      ok: true,
      token: account[0].token,
      pseudo: account[0].pseudo,
    }
  } catch (e) {
    console.error("[webauthn] finishAuthentication:", e)
    return {
      ok: false,
      error: "Déverrouillage impossible. Utilise ta clé secrète.",
    }
  }
}

// ─── Gestion ────────────────────────────────────────────────────────────────

export async function listWebAuthnCredentials(userToken: string): Promise<
  { id: string; deviceLabel: string | null; createdAt: string }[]
> {
  try {
    if (!(await ensureWebAuthnSchema())) return []
    const token = userToken?.trim()
    if (!token) return []
    const rows = await db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userToken, token))
    return rows.map((r) => ({
      id: r.credentialId,
      deviceLabel: r.deviceLabel,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }))
  } catch {
    return []
  }
}

export async function removeWebAuthnCredential(
  userToken: string,
  credentialId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    const token = userToken?.trim()
    const cid = credentialId?.trim()
    if (!token || !cid) return { ok: false, error: "Données manquantes." }

    const rows = await db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.credentialId, cid))
      .limit(1)
    if (!rows[0] || rows[0].userToken !== token) {
      return { ok: false, error: "Identifiant introuvable." }
    }
    await db.delete(webauthnCredentials).where(eq(webauthnCredentials.credentialId, cid))
    return { ok: true }
  } catch {
    return { ok: false, error: "Suppression impossible. Réessaie plus tard." }
  }
}

export async function removeAllWebAuthnCredentials(
  userToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!(await ensureWebAuthnSchema())) {
      return { ok: false, error: SOFT_FAIL.schema }
    }
    const token = userToken?.trim()
    if (!token) return { ok: false, error: "Session invalide." }
    await db.delete(webauthnCredentials).where(eq(webauthnCredentials.userToken, token))
    return { ok: true }
  } catch {
    return { ok: false, error: "Suppression impossible." }
  }
}

/** Appelé lors de la purge compte — best-effort, ne propage pas d'erreur. */
export async function purgeWebAuthnForToken(userToken: string) {
  try {
    if (!(await ensureWebAuthnSchema())) return
    const t = userToken?.trim()
    if (!t) return
    await db.delete(webauthnCredentials).where(eq(webauthnCredentials.userToken, t))
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.userToken, t))
  } catch {
    /* best-effort */
  }
}
