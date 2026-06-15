"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

const COOKIE_NAME = "vendor_session"

// Vérifie le code vendeur et pose un cookie de session httpOnly
export async function vendorLogin(_prevState: { error?: string } | null, formData: FormData) {
  const code = String(formData.get("code") ?? "")
  const expected = process.env.VENDOR_ACCESS_CODE

  if (!expected) {
    return { error: "Le code vendeur n'est pas configuré côté serveur." }
  }
  if (code !== expected) {
    return { error: "Code incorrect." }
  }

  // Cookie adaptatif : HTTPS (aperçu v0 en iframe cross-site) vs HTTP local
  const hdrs = await headers()
  const isHttps = (hdrs.get("x-forwarded-proto") ?? "http") === "https"

  const store = await cookies()
  store.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
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
