"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { getClientIp } from "@/lib/ip-check"
import { isRateLimited } from "@/lib/rate-limit"

const COOKIE_NAME = "vendor_session"

// Vérifie le code vendeur et pose un cookie de session httpOnly
export async function vendorLogin(_prevState: { error?: string } | null, formData: FormData) {
  const code = String(formData.get("code") ?? "")
  const expected = process.env.VENDOR_ACCESS_CODE

  if (!expected) {
    return { error: "Le code vendeur n'est pas configuré côté serveur." }
  }

  const ip = (await getClientIp()) || "unknown"
  if (isRateLimited(`vendor-login:${ip}`, 8, 15 * 60 * 1000)) {
    return { error: "Trop de tentatives. Réessaie dans quelques minutes." }
  }
  if (code !== expected) {
    return { error: "Code incorrect." }
  }

  // Cookie first-party (plus de SameSite=None hérité des previews v0 en iframe).
  const hdrs = await headers()
  const isHttps = (hdrs.get("x-forwarded-proto") ?? "http") === "https"

  const store = await cookies()
  store.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    // Pas de maxAge → cookie de session : supprimé à la fermeture du navigateur.
  })

  redirect("/messagerie")
}

// Déconnexion vendeur
export async function vendorLogout() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
  redirect("/messagerie")
}

// Renvoie true si la session vendeur est valide
export async function isVendorAuthenticated() {
  const expected = process.env.VENDOR_ACCESS_CODE
  if (!expected) return false
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value === expected
}
