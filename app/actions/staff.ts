"use server"

/**
 * Whitelist membres.
 * - L'admin saisit uniquement le pseudo.
 * - Le serveur génère une clé secrète (token) compatible connexion client
 *   (≥ 30 caractères, même format que les accès anonymes).
 * - Le membre se connecte avec cette clé sur l'écran de login classique.
 * - Un seul compte users classique est lié (pas de miroir / pseudo "Client").
 * - Pas d'accès admin.
 */

import { db } from "@/lib/db"
import {
  staffMembers,
  users,
  reservedPseudos,
  orderThreads,
  loyaltyCodes,
  promoUsages,
  userNewsReads,
  restockAlerts,
  loginLogs,
  pushSubscriptions,
  notificationReads,
  userVerifications,
} from "@/lib/db/schema"
import { eq, and, or, isNull, ne, sql } from "drizzle-orm"
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
  let key = Buffer.from(array)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  if (key.length < 30) key = key + generateSecretKey()
  return key.slice(0, 64)
}

function genInternalId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Réaffecte toutes les refs d'un ancien token vers le nouveau (conversations, etc.). */
async function migrateTokenReferences(oldToken: string, newToken: string, pseudo?: string | null) {
  const from = oldToken?.trim()
  const to = newToken?.trim()
  if (!from || !to || from === to) return

  await db
    .update(orderThreads)
    .set({
      customerToken: to,
      ...(pseudo ? { customerName: pseudo } : {}),
    })
    .where(eq(orderThreads.customerToken, from))

  await db.update(loyaltyCodes).set({ userToken: to }).where(eq(loyaltyCodes.userToken, from))
  await db.update(promoUsages).set({ userToken: to }).where(eq(promoUsages.userToken, from))
  await db.update(userNewsReads).set({ userToken: to }).where(eq(userNewsReads.userToken, from))
  await db.update(restockAlerts).set({ userToken: to }).where(eq(restockAlerts.userToken, from))
  await db.update(loginLogs).set({ userToken: to }).where(eq(loginLogs.userToken, from))
  await db
    .update(pushSubscriptions)
    .set({ customerToken: to })
    .where(eq(pushSubscriptions.customerToken, from))
  await db
    .update(notificationReads)
    .set({ customerToken: to })
    .where(eq(notificationReads.customerToken, from))
  await db
    .update(userVerifications)
    .set({ userToken: to, ...(pseudo ? { pseudo } : {}) })
    .where(eq(userVerifications.userToken, from))
}

/**
 * Attache au compte toutes les conversations portant le même pseudo
 * (même sous un autre token ou sans token), et corrige le customerName.
 */
export async function reattachAccountThreads(token: string, pseudo: string) {
  const t = token?.trim()
  const p = pseudo?.trim()
  if (!t || !p) return

  // Fils déjà sur ce token → bon pseudo
  await db
    .update(orderThreads)
    .set({ customerName: p })
    .where(eq(orderThreads.customerToken, t))

  // Fils au nom exact du pseudo (autre token / null) → rattacher
  await db
    .update(orderThreads)
    .set({ customerToken: t, customerName: p })
    .where(
      and(
        sql`lower(${orderThreads.customerName}) = lower(${p})`,
        or(isNull(orderThreads.customerToken), ne(orderThreads.customerToken, t)),
      ),
    )
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
  | { ok: true; id: number; pseudo: string; customerToken: string; reusedExisting?: boolean }
  | { ok: false; error: string }
> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const pseudo = input.pseudo?.trim()
  if (!pseudo) return { ok: false, error: "Pseudo requis." }

  const existingMember = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.pseudo, pseudo))
    .limit(1)
  if (existingMember.length > 0) {
    return {
      ok: false,
      error: "Ce pseudo existe déjà dans la whitelist. Utilise « Régénérer la clé » ou « Réparer le compte ».",
    }
  }

  // Compte users déjà existant avec ce pseudo → on le lie (un seul compte classique)
  const existingUsers = await db.select().from(users).where(eq(users.pseudo, pseudo)).limit(5)
  // Exclure les provisoire récupération
  const realUsers = existingUsers.filter(
    (u) => !(Array.isArray(u.flags) && u.flags.includes("lost_key_provisional")),
  )

  let customerToken: string
  let reusedExisting = false

  if (realUsers.length === 1) {
    customerToken = realUsers[0].token
    reusedExisting = true
    await reattachAccountThreads(customerToken, pseudo)
  } else if (realUsers.length > 1) {
    return {
      ok: false,
      error: "Plusieurs comptes avec ce pseudo. Fusionne-les d'abord (admin utilisateurs).",
    }
  } else {
    // Pseudo réservé sans user actif (compte supprimé) : on peut recréer
    customerToken = generateSecretKey()
    await db.insert(reservedPseudos).values({ pseudo }).onConflictDoNothing()
    // Si réservé avec deletedAt, on réactive
    await db
      .update(reservedPseudos)
      .set({ deletedAt: null })
      .where(eq(reservedPseudos.pseudo, pseudo))
    await db.insert(users).values({ token: customerToken, pseudo, flags: [] })
  }

  const inviteToken = genInternalId()
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
    reusedExisting,
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

// ─── Admin : régénérer la clé secrète (migre les conversations) ───────────
export async function regenerateWhitelistToken(
  id: number,
): Promise<{ ok: true; customerToken: string } | { ok: false; error: string }> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1)
  const member = rows[0]
  if (!member) return { ok: false, error: "Membre introuvable." }
  if (!member.pseudo) return { ok: false, error: "Pseudo manquant sur ce membre." }

  const newToken = generateSecretKey()
  const oldToken = member.customerToken?.trim() || null

  if (oldToken) {
    const userRows = await db.select().from(users).where(eq(users.token, oldToken)).limit(1)
    if (userRows[0]) {
      await db
        .update(users)
        .set({ token: newToken, pseudo: member.pseudo, flags: [] })
        .where(eq(users.id, userRows[0].id))
    } else {
      // staff a un token orphelin → chercher par pseudo
      const byPseudo = await db
        .select()
        .from(users)
        .where(eq(users.pseudo, member.pseudo))
        .limit(1)
      if (byPseudo[0]) {
        const prev = byPseudo[0].token
        await db
          .update(users)
          .set({ token: newToken, pseudo: member.pseudo, flags: [] })
          .where(eq(users.id, byPseudo[0].id))
        await migrateTokenReferences(prev, newToken, member.pseudo)
      } else {
        await db.insert(users).values({ token: newToken, pseudo: member.pseudo, flags: [] })
      }
    }
    await migrateTokenReferences(oldToken, newToken, member.pseudo)
  } else {
    const byPseudo = await db
      .select()
      .from(users)
      .where(eq(users.pseudo, member.pseudo))
      .limit(1)
    if (byPseudo[0]) {
      const prev = byPseudo[0].token
      await db
        .update(users)
        .set({ token: newToken, pseudo: member.pseudo, flags: [] })
        .where(eq(users.id, byPseudo[0].id))
      await migrateTokenReferences(prev, newToken, member.pseudo)
    } else {
      await db.insert(reservedPseudos).values({ pseudo: member.pseudo }).onConflictDoNothing()
      await db.insert(users).values({ token: newToken, pseudo: member.pseudo, flags: [] })
    }
  }

  await reattachAccountThreads(newToken, member.pseudo)

  await db
    .update(staffMembers)
    .set({ customerToken: newToken })
    .where(eq(staffMembers.id, id))

  revalidatePath("/admin")
  return { ok: true, customerToken: newToken }
}

/**
 * Répare un membre whitelist : un seul compte users, bon pseudo, conversations rattachées.
 * À utiliser si le membre se voit en « Client » ou sans historique.
 */
export async function repairWhitelistMember(
  id: number,
): Promise<
  | { ok: true; pseudo: string; customerToken: string; message: string }
  | { ok: false; error: string }
> {
  if (!(await isAdminAuthenticated())) return { ok: false, error: "Non autorisé." }

  const rows = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1)
  const member = rows[0]
  if (!member) return { ok: false, error: "Membre introuvable." }
  if (!member.pseudo) return { ok: false, error: "Pseudo manquant." }

  const pseudo = member.pseudo.trim()
  let token = member.customerToken?.trim() || ""

  // 1) Compte par token staff
  let user = token
    ? (await db.select().from(users).where(eq(users.token, token)).limit(1))[0]
    : undefined

  // 2) Sinon compte par pseudo
  if (!user) {
    const byPseudo = await db.select().from(users).where(eq(users.pseudo, pseudo)).limit(5)
    const candidates = byPseudo.filter(
      (u) => !(Array.isArray(u.flags) && u.flags.includes("lost_key_provisional")),
    )
    if (candidates.length === 1) {
      user = candidates[0]
      // Harmoniser : la clé staff devient celle du user existant (conversations déjà dessus)
      if (token && token !== user.token) {
        await migrateTokenReferences(token, user.token, pseudo)
      }
      token = user.token
      await db
        .update(staffMembers)
        .set({ customerToken: token })
        .where(eq(staffMembers.id, id))
    } else if (candidates.length > 1) {
      return { ok: false, error: "Plusieurs comptes users pour ce pseudo." }
    }
  }

  // 3) Toujours pas de user → créer
  if (!user) {
    if (!token) token = generateSecretKey()
    await db.insert(reservedPseudos).values({ pseudo }).onConflictDoNothing()
    await db
      .update(reservedPseudos)
      .set({ deletedAt: null })
      .where(eq(reservedPseudos.pseudo, pseudo))
    await db.insert(users).values({ token, pseudo, flags: [] })
    user = (await db.select().from(users).where(eq(users.token, token)).limit(1))[0]
    await db
      .update(staffMembers)
      .set({ customerToken: token })
      .where(eq(staffMembers.id, id))
  } else {
    // Forcer pseudo correct, retirer flags provisoire
    await db
      .update(users)
      .set({ pseudo, flags: [] })
      .where(eq(users.id, user.id))
    token = user.token
    if (member.customerToken !== token) {
      await db
        .update(staffMembers)
        .set({ customerToken: token })
        .where(eq(staffMembers.id, id))
    }
  }

  await reattachAccountThreads(token, pseudo)

  revalidatePath("/admin")
  return {
    ok: true,
    pseudo,
    customerToken: token,
    message: `Compte « ${pseudo} » réparé. Clé active : ${token.slice(0, 8)}… — conversations rattachées.`,
  }
}

/**
 * Connexion client : résout le compte à partir de la clé (users OU whitelist)
 * et rattache les conversations au bon pseudo.
 */
export async function resolveClientLogin(token: string): Promise<
  | { ok: true; pseudo: string; token: string }
  | { ok: false; error?: string; code?: "invalid" | "banned" | "short" }
> {
  const { normalizeSecretKey } = await import("@/lib/normalize-token")
  const t = normalizeSecretKey(token)
  if (!t || t.length < 20) {
    return { ok: false, code: "short", error: "Clé trop courte. Colle la clé secrète complète." }
  }

  // 1) Compte users classique
  let userRows = await db.select().from(users).where(eq(users.token, t)).limit(1)
  let user = userRows[0]

  // 2) Clé whitelist sans ligne users (orphelin) → recréer
  const staffRows = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.customerToken, t), eq(staffMembers.active, true)))
    .limit(1)
  const staff = staffRows[0]

  if (!user && staff?.pseudo) {
    await db.insert(reservedPseudos).values({ pseudo: staff.pseudo }).onConflictDoNothing()
    // Si un user existe déjà sous ce pseudo avec un autre token, on le bascule sur cette clé
    const byPseudo = await db
      .select()
      .from(users)
      .where(eq(users.pseudo, staff.pseudo))
      .limit(1)
    if (byPseudo[0]) {
      const old = byPseudo[0].token
      await db
        .update(users)
        .set({ token: t, pseudo: staff.pseudo, flags: [] })
        .where(eq(users.id, byPseudo[0].id))
      await migrateTokenReferences(old, t, staff.pseudo)
      user = (await db.select().from(users).where(eq(users.token, t)).limit(1))[0]
    } else {
      await db.insert(users).values({ token: t, pseudo: staff.pseudo, flags: [] })
      user = (await db.select().from(users).where(eq(users.token, t)).limit(1))[0]
    }
  }

  if (!user) {
    return {
      ok: false,
      code: "invalid",
      error:
        "Clé introuvable. Vérifie qu'elle est complète (copier-coller sans espace). Si tu as perdu ta clé, utilise « Clé perdue ».",
    }
  }

  const flags = Array.isArray(user.flags) ? user.flags : []
  if (flags.includes("banni") || flags.includes("lost_key_rejected")) {
    return {
      ok: false,
      code: "banned",
      error: "Ce compte est suspendu. Contacte le support via « Clé perdue » si besoin.",
    }
  }

  // Whitelist : imposer le pseudo staff et réparer les fils
  if (staff?.pseudo) {
    if (user.pseudo !== staff.pseudo || flags.length > 0) {
      await db
        .update(users)
        .set({ pseudo: staff.pseudo, flags: [] })
        .where(eq(users.id, user.id))
      user = { ...user, pseudo: staff.pseudo, flags: [] }
    }
    await reattachAccountThreads(t, staff.pseudo)
    return { ok: true, pseudo: staff.pseudo, token: t }
  }

  // Client normal : corriger au moins le nom sur ses fils
  if (user.pseudo) {
    await db
      .update(orderThreads)
      .set({ customerName: user.pseudo })
      .where(
        and(
          eq(orderThreads.customerToken, t),
          or(
            eq(orderThreads.customerName, "Client"),
            eq(orderThreads.customerName, "client"),
            sql`${orderThreads.customerName} = ''`,
          ),
        ),
      )
  }

  // Journalise la connexion (même chemin que getAccount)
  try {
    const { recordLogin } = await import("@/app/actions/login-logs")
    recordLogin(t).catch(() => {})
  } catch {
    /* ignore */
  }

  return { ok: true, pseudo: user.pseudo, token: t }
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
  // Ne supprime PAS le compte users ni les commandes — seulement l'entrée whitelist
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
