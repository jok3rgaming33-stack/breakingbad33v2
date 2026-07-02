"use server"

import { cookies } from "next/headers"

const SESSION_KEY = "demo_session"
const SESSION_VALUE = "granted"

export async function verifyDemoPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const expected = process.env.DEMO_PASSWORD
  if (!expected) return { ok: false, error: "Démo non configurée." }
  if (password.trim() !== expected.trim()) return { ok: false, error: "Mot de passe incorrect." }
  const jar = await cookies()
  jar.set(SESSION_KEY, SESSION_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/demo",
    maxAge: 60 * 60 * 4, // 4 heures
  })
  return { ok: true }
}

export async function isDemoAuthorized(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(SESSION_KEY)?.value === SESSION_VALUE
}
