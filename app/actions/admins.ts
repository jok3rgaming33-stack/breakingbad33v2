"use server"

import { db } from "@/lib/db"
import { adminAccounts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated, hashPassword } from "./admin-auth"

export type AdminRow = {
  id: number
  pseudo: string
  token: string
  hasPassword: boolean
  active: boolean
  createdAt: string
}

function genToken() {
  // Token long et aléatoire (URL-safe).
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function listAdmins(): Promise<AdminRow[]> {
  if (!(await isAdminAuthenticated())) return []
  const rows = await db.select().from(adminAccounts).orderBy(adminAccounts.createdAt)
  return rows.map((r) => ({
    id: r.id,
    pseudo: r.pseudo,
    token: r.token,
    hasPassword: Boolean(r.passwordHash),
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function createAdmin(input: { pseudo: string; password?: string | null }) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const pseudo = input.pseudo?.trim()
  if (!pseudo) return { ok: false as const, error: "Pseudo requis." }

  const existing = await db.select().from(adminAccounts).where(eq(adminAccounts.pseudo, pseudo)).limit(1)
  if (existing.length > 0) return { ok: false as const, error: "Ce pseudo admin existe déjà." }

  const token = genToken()
  const passwordHash = input.password?.trim() ? hashPassword(input.password.trim()) : null
  await db.insert(adminAccounts).values({ pseudo, token, passwordHash, active: true })
  revalidatePath("/admin")
  return { ok: true as const, token }
}

export async function setAdminActive(id: number, active: boolean) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await db.update(adminAccounts).set({ active }).where(eq(adminAccounts.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}

// Définit (ou retire si password vide) un mot de passe choisi pour un admin.
export async function setAdminPassword(id: number, password: string | null) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const passwordHash = password?.trim() ? hashPassword(password.trim()) : null
  await db.update(adminAccounts).set({ passwordHash }).where(eq(adminAccounts.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}

export async function regenerateAdminToken(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const token = genToken()
  await db.update(adminAccounts).set({ token }).where(eq(adminAccounts.id, id))
  revalidatePath("/admin")
  return { ok: true as const, token }
}

export async function deleteAdmin(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await db.delete(adminAccounts).where(eq(adminAccounts.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}
