"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

const COOKIE_NAME = "admin_session"
const ADMIN_PSEUDO = "Heisenberg"

// Vérifie un token : renvoie true s'il correspond au token admin
export async function isAdminToken(token: string) {
  const expected = process.env.ADMIN_TOKEN
  return Boolean(expected) && token === expected
}

// Pose le cookie de session admin après validation du token.
// Renvoie { ok, pseudo } pour que le client connaisse le pseudo réservé.
export async function adminLogin(token: string): Promise<{ ok: boolean; pseudo?: string; error?: string }> {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return { ok: false, error: "Le token admin n'est pas configuré côté serveur." }
  if (token !== expected) return { ok: false, error: "Token invalide." }

  const hdrs = await headers()
  const isHttps = (hdrs.get("x-forwarded-proto") ?? "http") === "https"

  const store = await cookies()
  store.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 jours (accès durable)
  })

  return { ok: true, pseudo: ADMIN_PSEUDO }
}

// Lu côté serveur (panel admin) pour vérifier la session
export async function isAdminAuthenticated() {
  const store = await cookies()
  const session = store.get(COOKIE_NAME)?.value
  return Boolean(session) && session === process.env.ADMIN_TOKEN
}

export async function adminLogout() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
  redirect("/")
}

// Action de formulaire pour la porte du panel admin (/admin)
export async function adminGateAction(_prevState: { error?: string } | null, formData: FormData) {
  const token = String(formData.get("token") ?? "")
  const res = await adminLogin(token)
  if (!res.ok) return { error: res.error ?? "Token invalide." }
  redirect("/admin")
}
