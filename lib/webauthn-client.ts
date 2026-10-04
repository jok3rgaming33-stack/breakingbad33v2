"use client"

/**
 * Helpers client pour le déverrouillage biométrique (WebAuthn / platform authenticator).
 * Les IDs de credentials restent en localStorage pour proposer le bouton sans re-saisie de clé.
 */

export const WEBAUTHN_FLAG_KEY = "bb33_webauthn"
export const WEBAUTHN_IDS_KEY = "bb33_webauthn_ids"

export function browserSupportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  )
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    }
  } catch {
    /* ignore */
  }
  // Fallback : support WebAuthn sans info platform
  return true
}

export function getLocalCredentialIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(WEBAUTHN_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0)
  } catch {
    return []
  }
}

export function hasLocalWebAuthn(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(WEBAUTHN_FLAG_KEY) === "1" && getLocalCredentialIds().length > 0
}

export function rememberLocalCredential(credentialId: string) {
  if (typeof window === "undefined" || !credentialId) return
  const ids = new Set(getLocalCredentialIds())
  ids.add(credentialId)
  localStorage.setItem(WEBAUTHN_IDS_KEY, JSON.stringify([...ids]))
  localStorage.setItem(WEBAUTHN_FLAG_KEY, "1")
}

export function forgetLocalCredential(credentialId: string) {
  if (typeof window === "undefined") return
  const next = getLocalCredentialIds().filter((id) => id !== credentialId)
  if (next.length === 0) {
    localStorage.removeItem(WEBAUTHN_IDS_KEY)
    localStorage.removeItem(WEBAUTHN_FLAG_KEY)
  } else {
    localStorage.setItem(WEBAUTHN_IDS_KEY, JSON.stringify(next))
    localStorage.setItem(WEBAUTHN_FLAG_KEY, "1")
  }
}

export function clearLocalWebAuthn() {
  if (typeof window === "undefined") return
  localStorage.removeItem(WEBAUTHN_IDS_KEY)
  localStorage.removeItem(WEBAUTHN_FLAG_KEY)
}

export type BiometricLoginResult =
  | { ok: true; admin: true; pseudo: string }
  | { ok: true; admin: false; token: string; pseudo: string; credentialId?: string }
  | { ok: false; error: string; clearLocal?: boolean }

/** Déverrouillage biométrique (client ou admin). À appeler depuis un clic. */
export async function runBiometricLogin(): Promise<BiometricLoginResult> {
  const { loadWebAuthnBrowser } = await import("@/lib/webauthn-browser")
  const { startWebAuthnAuthentication, finishWebAuthnAuthentication } = await import(
    "@/app/actions/webauthn"
  )
  const api = await loadWebAuthnBrowser()
  if (!api) {
    return { ok: false, error: "Biométrie indisponible sur cet appareil. Utilise ta clé ou ton token." }
  }
  const ids = getLocalCredentialIds()
  const start = await startWebAuthnAuthentication(ids.length ? ids : undefined)
  if (!start.ok) {
    return {
      ok: false,
      error: start.error,
      clearLocal: "clearLocal" in start ? start.clearLocal : undefined,
    }
  }
  const assertion = (await api.startAuthentication({
    optionsJSON: start.options,
  })) as { id: string }
  const done = await finishWebAuthnAuthentication({
    challengeId: start.challengeId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: assertion as any,
  })
  if (!done.ok) {
    return {
      ok: false,
      error: done.error,
      clearLocal: "clearLocal" in done ? done.clearLocal : undefined,
    }
  }
  if (assertion?.id) rememberLocalCredential(assertion.id)
  if (done.admin) return { ok: true, admin: true, pseudo: done.pseudo }
  return { ok: true, admin: false, token: done.token, pseudo: done.pseudo, credentialId: assertion?.id }
}

export function biometryLabel(): string {
  if (typeof navigator === "undefined") return "biométrie"
  const ua = navigator.userAgent || ""
  // Heuristiques d'affichage uniquement (l'OS choisit le capteur réel)
  if (/iPhone|iPad|iPod/.test(ua)) return "Face ID / Touch ID"
  if (/Macintosh/.test(ua) && !(navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints) {
    return "Touch ID"
  }
  if (/Windows/.test(ua)) return "Windows Hello"
  if (/Android/.test(ua)) return "empreinte / déverrouillage"
  return "biométrie"
}
