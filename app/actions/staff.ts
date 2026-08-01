"use server"

/**
 * Whitelist membres.
 * - L'admin saisit uniquement le pseudo.
 * - Le serveur génère une clé secrète (token) compatible connexion client
 *   (≥ 30 caractères, même format que les accès anonymes).
 * - Le membre se connecte avec cette clé sur l'écran de login classique.
 * - Pas d'accès admin.
 */

import { db } from "@/lib/db"
import { staffMembers, users, reservedPseudos } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "./admin-auth"

export type StaffRow = {
  id: number
  pseudo: string | null
  active: boolean
  createdAt: string
  canAdmin: false
  inviteUsed: true
  inviteToken: string
  permissions: string[]
  /** Clé secrète client (token) — à transmettre au membre */
  customerToken: string | null
}

/** Même protocole que login-page generateSecretKey : base64url, ~43 car. (≥ 30). */
function generateSecretKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Buffer.from(array)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function genInternalId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

// ─── Admin : lister ───────────────────────────────────────────────────────
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

// ─── Admin : créer (pseudo seul → token généré) ───────────────────────────
export async function createWhitelistMember(input: {
  pseudo: string
}): Promise<
  | { ok: true; id: number; pseudo: string; customerToken: string }
  | { ok: false; error: string }
> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const pseudo = input.pseudo?.trim()
  if (!pseudo) return { ok: false, error: "Pseudo requis." }

  const existingMember = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.pseudo, pseudo))
    .limit(1)
  if (existingMember.length > 0) {
    return { ok: false, error: "Ce pseudo existe déjà dans la whitelist." }
  }

  const taken = await db
    .select({ id: reservedPseudos.id })
    .from(reservedPseudos)
    .where(eq(reservedPseudos.pseudo, pseudo))
    .limit(1)
  if (taken.length > 0) {
    return { ok: false, error: "Ce pseudo est déjà utilisé. Choisis-en un autre." }
  }

  // Token = clé secrète client (connexion page d'accueil)
  let customerToken = generateSecretKey()
  // Garantir ≥ 30 car. (exigence loginWithKey)
  if (customerToken.length < 30) {
    customerToken = generateSecretKey() + generateSecretKey()
  }

  const inviteToken = genInternalId()

  await db.insert(reservedPseudos).values({ pseudo }).onConflictDoNothing()
  await db.insert(users).values({ token: customerToken, pseudo })
  const inserted = await db
    .insert(staffMembers)
    .values({
      pseudo,
      passwordHash: null,
      inviteToken,
      canAdmin: false,
      permissions: [],
      inviteUsed: true,
      active: true,
      customerToken,
    })
    .returning({ id: staffMembers.id })

  revalidatePath("/admin")
  return {
    ok: true,
    id: inserted[0]?.id ?? 0,
    pseudo,
    customerToken,
  }
}

/** @deprecated */
export async function createStaffMember(_input: {
  canAdmin: boolean
  permissions: string[]
}): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: "Utilise la whitelist : pseudo seul, token généré automatiquement.",
  }
}

// ─── Admin : régénérer la clé secrète ─────────────────────────────────────
export async function regenerateWhitelistToken(
  id: number,
): Promise<{ ok: true; customerToken: string } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1)
  const member = rows[0]
  if (!member) return { ok: false, error: "Membre introuvable." }

  let customerToken = generateSecretKey()
  if (customerToken.length < 30) {
    customerToken = generateSecretKey() + generateSecretKey()
  }

  // Met à jour le token users si l'ancien existe
  if (member.customerToken) {
    await db
      .update(users)
      .set({ token: customerToken })
      .where(eq(users.token, member.customerToken))
  } else if (member.pseudo) {
    await db.insert(users).values({ token: customerToken, pseudo: member.pseudo })
  }

  await db
    .update(staffMembers)
    .set({ customerToken })
    .where(eq(staffMembers.id, id))

  revalidatePath("/admin")
  return { ok: true, customerToken }
}

/** @deprecated — plus de mdp libre */
export async function setWhitelistPassword(
  _id: number,
  _password: string,
): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: "Les membres utilisent une clé secrète générée. Utilise « Régénérer la clé ».",
  }
}

export async function setStaffActive(id: number, active: boolean): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  await db.update(staffMembers).set({ active }).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteStaffMember(id: number): Promise<{ ok: boolean }> {
  if (!(await isAdminAuthenticated())) return { ok: false }
  await db.delete(staffMembers).where(eq(staffMembers.id, id))
  revalidatePath("/admin")
  return { ok: true }
}

export async function regenerateStaffInvite(_id: number): Promise<{ ok: false }> {
  return { ok: false }
}

export async function getStaffInvite(_token: string): Promise<{ ok: false }> {
  return { ok: false }
}

export async function completeStaffOnboarding(_input: {
  token: string
  pseudo: string
  password: string
  confirmPassword: string
}): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: "Invitations staff désactivées. Connexion via clé secrète whitelist.",
  }
}

export async function loginWhitelistMember(_input: {
  pseudo: string
  password: string
}): Promise<{ ok: false; error: string }> {
  return {
    ok: false,
    error: "Connexion par clé secrète uniquement (écran « J'ai déjà une clé »).",
  }
}

export async function loginStaff(input: { pseudo: string; password: string }) {
  return loginWhitelistMember(input)
}
