"use server"

import { db } from "@/lib/db"
import { staffMembers, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "./admin-auth"
import { hashPassword, verifyPassword } from "@/lib/admin-password"

// ─── Types ─────────────────────────────────────────────────────────────────
export type StaffRow = {
  id: number
  pseudo: string | null
  inviteToken: string
  canAdmin: boolean
  permissions: string[]
  inviteUsed: boolean
  active: boolean
  customerToken: string | null
  createdAt: string
}

export type CreateStaffInput = {
  canAdmin: boolean
  permissions: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function genToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// ─── Admin : lister le staff ───────────────────────────────────────────────
export async function listStaff(): Promise<StaffRow[]> {
  if (!(await isAdminAuthenticated())) return []
  const rows = await db.select().from(staffMembers).orderBy(staffMembers.createdAt)
  return rows.map((r) => ({
    id: r.id,
    pseudo: r.pseudo,
    inviteToken: r.inviteToken,
    canAdmin: r.canAdmin,
    permissions: (r.permissions ?? []) as string[],
    inviteUsed: r.inviteUsed,
    active: r.active,
    customerToken: r.customerToken,
    createdAt: r.createdAt.toISOString(),
  }))
}

// ─── Admin : créer un membre du staff ─────────────────────────────────────
// Retourne le token d'invitation unique à partager avec le membre.
export async function createStaffMember(
  input: CreateStaffInput,
): Promise<{ ok: true; inviteToken: string } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  const inviteToken = genToken()
  await db.insert(staffMembers).values({
    inviteToken,
    canAdmin: input.canAdmin,
    permissions: input.permissions,
  })
  revalidatePath("/admin")
  return { ok: true, inviteToken }
}

// ─── Admin : activer / suspendre un membre ────────────────────────────────
export async function setStaffActive(
  id: number,
  active: boolean,
): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  await db.update(staffMembers).set({ active }).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : supprimer un membre ──────────────────────────────────────────
export async function deleteStaffMember(id: number): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  await db.delete(staffMembers).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : régénérer le lien d'invitation ───────────────────────────────
export async function regenerateStaffInvite(
  id: number,
): Promise<{ ok: true; inviteToken: string } | { ok: false }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  const inviteToken = genToken()
  await db
    .update(staffMembers)
    .set({ inviteToken, inviteUsed: false, pseudo: null, passwordHash: null, customerToken: null })
    .where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true, inviteToken }
}

// ─── Public : lire les infos d'invitation (pour la page onboarding) ───────
export async function getStaffInvite(
  token: string,
): Promise<{ ok: true; id: number; canAdmin: boolean; permissions: string[]; alreadyUsed: boolean } | { ok: false }> {
  const rows = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.inviteToken, token))
    .limit(1)
  const row = rows[0]
  if (!row) return { ok: false }
  return {
    ok: true,
    id: row.id,
    canAdmin: row.canAdmin,
    permissions: (row.permissions ?? []) as string[],
    alreadyUsed: row.inviteUsed,
  }
}

// ─── Public : valider l'onboarding (pseudo + mot de passe) ────────────────
export async function completeStaffOnboarding(input: {
  token: string
  pseudo: string
  password: string
  confirmPassword: string
}): Promise<{ ok: true; canAdmin: boolean; customerToken?: string } | { ok: false; error: string }> {
  const { token, pseudo, password, confirmPassword } = input

  if (!pseudo?.trim()) return { ok: false, error: "Le pseudo est requis." }
  if (!password) return { ok: false, error: "Le mot de passe est requis." }
  if (password !== confirmPassword) return { ok: false, error: "Les mots de passe ne correspondent pas." }

  // Règles de complexité (même règles que restore-access)
  if (password.length < 8) return { ok: false, error: "8 caractères minimum." }
  if (!/[A-Z]/.test(password)) return { ok: false, error: "Au moins une majuscule requise." }
  if (!/[0-9]/.test(password)) return { ok: false, error: "Au moins un chiffre requis." }
  if (!/[-_/*ù]/.test(password)) return { ok: false, error: "Au moins un symbole parmi : - _ / * ù" }

  const rows = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.inviteToken, token))
    .limit(1)
  const member = rows[0]
  if (!member) return { ok: false, error: "Lien invalide." }
  if (member.inviteUsed) return { ok: false, error: "Ce lien d'invitation a déjà été utilisé." }
  if (!member.active) return { ok: false, error: "Ce compte staff a été désactivé." }

  const passwordHash = hashPassword(password)
  const updates: Partial<typeof member> = {
    pseudo: pseudo.trim(),
    passwordHash,
    inviteUsed: true,
  }

  // Si le membre n'a pas accès admin → on crée aussi un compte client lié
  let customerToken: string | undefined
  if (!member.canAdmin) {
    customerToken = `stf_${genToken().slice(0, 40)}`
    await db.insert(users).values({
      token: customerToken,
      pseudo: pseudo.trim(),
    })
    updates.customerToken = customerToken
  }

  await db.update(staffMembers).set(updates).where(eq(staffMembers.id, member.id))
  revalidatePath("/admin")
  return { ok: true, canAdmin: member.canAdmin, customerToken }
}

// ─── Public : connexion staff avec pseudo + mot de passe ─────────────────
export async function loginStaff(input: {
  pseudo: string
  password: string
}): Promise<
  | { ok: true; canAdmin: boolean; customerToken: string | null; permissions: string[] }
  | { ok: false; error: string }
> {
  const { pseudo, password } = input
  if (!pseudo?.trim() || !password) return { ok: false, error: "Pseudo et mot de passe requis." }

  const rows = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.pseudo, pseudo.trim()))
    .limit(1)
  const member = rows[0]
  if (!member || !member.inviteUsed || !member.passwordHash) {
    return { ok: false, error: "Identifiants incorrects." }
  }
  if (!member.active) return { ok: false, error: "Ce compte staff est désactivé." }
  if (!verifyPassword(password, member.passwordHash)) {
    return { ok: false, error: "Identifiants incorrects." }
  }
  return {
    ok: true,
    canAdmin: member.canAdmin,
    customerToken: member.customerToken,
    permissions: (member.permissions ?? []) as string[],
  }
}
