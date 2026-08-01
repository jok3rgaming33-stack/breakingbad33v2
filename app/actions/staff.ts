"use server"

/**
 * Whitelist membres (ex-staff simplifié).
 * - Créés par l'admin : pseudo + mot de passe libre (pas de 30 car., pas de complexité).
 * - Connexion client uniquement (pas d'accès panel admin).
 * - Compte users lié en interne (token long généré).
 */

import { db } from "@/lib/db"
import { staffMembers, users, reservedPseudos } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "./admin-auth"
import { hashPassword, verifyPassword } from "@/lib/admin-password"

export type StaffRow = {
  id: number
  pseudo: string | null
  active: boolean
  createdAt: string
  /** Toujours false — legacy type compat */
  canAdmin: false
  inviteUsed: true
  inviteToken: string
  permissions: string[]
  customerToken: string | null
}

function genToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// ─── Admin : lister les membres whitelist ─────────────────────────────────
export async function listStaff(): Promise<StaffRow[]> {
  if (!(await isAdminAuthenticated())) return []
  const rows = await db.select().from(staffMembers).orderBy(staffMembers.createdAt)
  return rows.map((r) => ({
    id: r.id,
    pseudo: r.pseudo,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    canAdmin: false as const,
    inviteUsed: true as const,
    inviteToken: r.inviteToken,
    permissions: [] as string[],
    customerToken: r.customerToken,
  }))
}

export async function listWhitelistMembers() {
  return listStaff()
}

// ─── Admin : créer un membre (pseudo + mdp libre) ─────────────────────────
export async function createWhitelistMember(input: {
  pseudo: string
  password: string
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const pseudo = input.pseudo?.trim()
  const password = input.password ?? ""
  if (!pseudo) return { ok: false, error: "Pseudo requis." }
  if (!password || password.length < 1) {
    return { ok: false, error: "Mot de passe requis (libre, aucun minimum de 30 caractères)." }
  }

  // Pseudo déjà pris en whitelist
  const existingMember = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.pseudo, pseudo))
    .limit(1)
  if (existingMember.length > 0) {
    return { ok: false, error: "Ce pseudo existe déjà dans la whitelist." }
  }

  // Pseudo réservé (clients anonymes)
  const taken = await db
    .select({ id: reservedPseudos.id })
    .from(reservedPseudos)
    .where(eq(reservedPseudos.pseudo, pseudo))
    .limit(1)
  if (taken.length > 0) {
    return { ok: false, error: "Ce pseudo est déjà utilisé. Choisis-en un autre." }
  }

  const customerToken = `wl_${genToken()}`
  const inviteToken = genToken() // identifiant interne unique (plus de lien d'invitation)
  const passwordHash = hashPassword(password)

  await db.insert(reservedPseudos).values({ pseudo }).onConflictDoNothing()
  await db.insert(users).values({ token: customerToken, pseudo })
  await db.insert(staffMembers).values({
    pseudo,
    passwordHash,
    inviteToken,
    canAdmin: false,
    permissions: [],
    inviteUsed: true,
    active: true,
    customerToken,
  })

  revalidatePath("/admin")
  return { ok: true, id: 0 }
}

/** @deprecated use createWhitelistMember */
export async function createStaffMember(_input: {
  canAdmin: boolean
  permissions: string[]
}): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: "Ancien système staff désactivé. Utilise la whitelist (pseudo + mot de passe).",
  }
}

// ─── Admin : changer le mot de passe ──────────────────────────────────────
export async function setWhitelistPassword(
  id: number,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }
  if (!password || password.length < 1) {
    return { ok: false, error: "Mot de passe requis." }
  }
  await db
    .update(staffMembers)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : activer / suspendre ──────────────────────────────────────────
export async function setStaffActive(id: number, active: boolean): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  await db.update(staffMembers).set({ active }).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

// ─── Admin : supprimer ────────────────────────────────────────────────────
export async function deleteStaffMember(id: number): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  const rows = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1)
  const member = rows[0]
  if (member?.customerToken) {
    // On garde le user en base pour l'historique éventuel, ou on le laisse :
    // pour une whitelist simple on ne supprime pas forcément le users row.
  }
  await db.delete(staffMembers).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

// Anciennes APIs invitation — désactivées
export async function regenerateStaffInvite(
  _id: number,
): Promise<{ ok: false }> {
  return { ok: false }
}

export async function getStaffInvite(
  _token: string,
): Promise<{ ok: false }> {
  return { ok: false }
}

export async function completeStaffOnboarding(_input: {
  token: string
  pseudo: string
  password: string
  confirmPassword: string
}): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Les invitations staff sont désactivées. Demande un accès whitelist à l'admin." }
}

// ─── Public : connexion membre (pseudo + mdp libre) ───────────────────────
export async function loginWhitelistMember(input: {
  pseudo: string
  password: string
}): Promise<
  | { ok: true; pseudo: string; customerToken: string }
  | { ok: false; error: string }
> {
  const pseudo = input.pseudo?.trim()
  const password = input.password ?? ""
  if (!pseudo || !password) {
    return { ok: false, error: "Pseudo et mot de passe requis." }
  }

  const rows = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.pseudo, pseudo))
    .limit(1)
  const member = rows[0]
  if (!member || !member.passwordHash || !member.customerToken) {
    return { ok: false, error: "Identifiants incorrects." }
  }
  if (!member.active) {
    return { ok: false, error: "Ce compte est désactivé." }
  }
  // Jamais d'accès admin via whitelist
  if (member.canAdmin) {
    return { ok: false, error: "Utilise le panel admin pour les comptes administrateurs." }
  }
  if (!verifyPassword(password, member.passwordHash)) {
    return { ok: false, error: "Identifiants incorrects." }
  }

  return {
    ok: true,
    pseudo: member.pseudo ?? pseudo,
    customerToken: member.customerToken,
  }
}

/** @deprecated alias */
export async function loginStaff(input: {
  pseudo: string
  password: string
}) {
  return loginWhitelistMember(input)
}
