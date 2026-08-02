"use client"

/**
 * Chargement dynamique de @simplewebauthn/browser.
 * Si le module plante (CDN, build, navigateur exotique), la page de login
 * continue de fonctionner uniquement avec la clé secrète.
 */

export type WebAuthnBrowserApi = {
  startRegistration: (opts: {
    optionsJSON: unknown
    useAutoRegister?: boolean
  }) => Promise<unknown>
  startAuthentication: (opts: {
    optionsJSON: unknown
    useBrowserAutofill?: boolean
  }) => Promise<{ id: string; [key: string]: unknown }>
  browserSupportsWebAuthn: () => boolean
}

let cached: WebAuthnBrowserApi | null | undefined

export async function loadWebAuthnBrowser(): Promise<WebAuthnBrowserApi | null> {
  if (cached !== undefined) return cached
  try {
    const mod = await import("@simplewebauthn/browser")
    if (
      typeof mod.startRegistration !== "function" ||
      typeof mod.startAuthentication !== "function"
    ) {
      cached = null
      return null
    }
    cached = {
      startRegistration: mod.startRegistration as unknown as WebAuthnBrowserApi["startRegistration"],
      startAuthentication: mod.startAuthentication as unknown as WebAuthnBrowserApi["startAuthentication"],
      browserSupportsWebAuthn:
        typeof mod.browserSupportsWebAuthn === "function"
          ? mod.browserSupportsWebAuthn
          : () =>
              typeof window !== "undefined" &&
              typeof window.PublicKeyCredential !== "undefined",
    }
    return cached
  } catch (e) {
    console.warn("[webauthn] module browser indisponible:", e)
    cached = null
    return null
  }
}
