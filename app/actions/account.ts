"use server"

import { db } from "@/lib/db"
import {
  users, orderThreads, threadMessages, accountCreations,
  userVerifications, loyaltyCodes, promoUsages, userNewsReads,
  pushSubscriptions, restockAlerts, reservedPseudos,
} from "@/lib/db/schema"
import { eq, desc, sql, and, gte, inArray } from "drizzle-orm"
import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { isClosedStatus, normalizeStatus } from "@/lib/order-status"
import {
  computeLoyaltyPoints,
  computeTierPoints,
  resolveEffectiveTier,
  maxTierId,
  buildReferralCode,
  FREE_DELIVERY_DAYS,
  PLATINUM_FREE_DELIVERY_MIN,
  type LoyaltyTierId,
  REFERRAL_BONUS_REFEREE,
  REFERRAL_BONUS_REFERRER,
  REFERRAL_BONUS_PLATINUM_EXTRA,
} from "@/lib/loyalty"
import { notifyVendor } from "@/lib/push"
import { getClientIp, isVpnOrProxy } from "@/lib/ip-check"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { USER_FLAGS } from "@/lib/user-flags"
import { recordLogin, deleteLoginLogsByToken } from "@/app/actions/login-logs"
import { ensureFeatureSchema } from "@/lib/feature-schema"

// Crée (ou réenregistre) un compte anonyme : associe une clé secrète à un pseudo.
// Idempotent : si la clé existe déjà, on conserve le pseudo d'origine.
// Applique une limite d'1 création par mois et par IP, et bloque les VPN/proxies.
// referralCode optionnel : code parrain d'un membre existant.
export async function createAccount(token: string, pseudo: string, referralCode?: string) {
  const t = token?.trim()
  const p = pseudo?.trim()
  if (!t || t.length < 20 || !p) return { ok: false as const, error: "Paramètres invalides." }

  await ensureFeatureSchema()

  const existing = await db.select().from(users).where(eq(users.token, t)).limit(1)
  if (existing.length > 0) {
    await recordLogin(t)
    return { ok: true as const, pseudo: existing[0].pseudo }
  }

  // Vérifie que le pseudo n'est pas déjà réservé (compte actif OU supprimé).
  const taken = await db.select({ id: reservedPseudos.id }).from(reservedPseudos).where(eq(reservedPseudos.pseudo, p)).limit(1)
  if (taken.length > 0) {
    return { ok: false as const, error: "Ce pseudo est déjà pris. Choisis-en un autre." }
  }

  // --- Contrôles anti-comptes multiples (uniquement pour un NOUVEAU compte) ---
  const ip = await getClientIp()

  // 1) Blocage des VPN / proxies.
  if (await isVpnOrProxy(ip)) {
    return {
      ok: false as const,
      error:
        "La création de compte via VPN ou proxy n'est pas autorisée. Désactive-le puis réessaie.",
    }
  }

  // 2) Limite d'un compte par mois et par IP.
  if (ip) {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recent = await db
      .select({ id: accountCreations.id })
      .from(accountCreations)
      .where(and(eq(accountCreations.ip, ip), gte(accountCreations.createdAt, monthAgo)))
      .limit(1)
    if (recent.length > 0) {
      return {
        ok: false as const,
        error:
          "Un compte a déjà été créé depuis cette connexion ce mois-ci. Une seule création par mois est autorisée.",
      }
    }
  }

  // Parrain optionnel (lien stocké ; bonus versé à la 1ʳᵉ livraison — voir grantReferralBonusOnFirstDelivery)
  let referrer: typeof users.$inferSelect | null = null
  const refCode = referralCode?.trim().toUpperCase()
  if (refCode) {
    const refRows = await db.select().from(users).where(eq(users.referralCode, refCode)).limit(1)
    if (refRows[0] && refRows[0].token !== t) {
      referrer = refRows[0]
    }
  }

  // Réserve le pseudo de façon permanente (même si le compte est supprimé plus tard).
  await db.insert(reservedPseudos).values({ pseudo: p }).onConflictDoNothing()

  const inserted = await db
    .insert(users)
    .values({
      token: t,
      pseudo: p,
      referredBy: referrer?.token ?? null,
      referralBonusGranted: false,
    })
    .returning({ id: users.id })

  const newId = inserted[0]?.id
  if (newId) {
    const code = buildReferralCode(p, newId)
    try {
      await db.update(users).set({ referralCode: code }).where(eq(users.id, newId))
    } catch {
      /* ignore */
    }
  }

  // Journalise l'IP pour faire respecter la limite mensuelle.
  if (ip) {
    await db.insert(accountCreations).values({ ip })
  }

  // Notifie le vendeur de l'arrivée d'un nouveau membre.
  await notifyVendor({
    title: "Nouveau membre",
    body: referrer
      ? `${p} vient de créer un compte (parrainé par ${referrer.pseudo} — bonus à la 1ʳᵉ livraison).`
      : `${p} vient de créer un compte.`,
    url: "/admin",
    tag: "new-member",
  })

  // Première connexion = création de compte (getAccount n'est pas appelé ici)
  await recordLogin(t)

  return {
    ok: true as const,
    pseudo: p,
    referralLinked: !!referrer,
  }
}

/**
 * Crédite le bonus parrainage à la 1ʳᵉ commande livrée du filleul.
 * - Filleul : +REFERRAL_BONUS_REFEREE
 * - Parrain : +REFERRAL_BONUS_REFERRER (+ extra Platine si CA livré ≥ 600€)
 * Idempotent via users.referral_bonus_granted.
 */
export async function grantReferralBonusOnFirstDelivery(customerToken: string | null | undefined): Promise<{
  granted: boolean
  refereeBonus?: number
  referrerBonus?: number
}> {
  const t = customerToken?.trim()
  if (!t) return { granted: false }

  try {
    await ensureFeatureSchema()

    const urows = await db.select().from(users).where(eq(users.token, t)).limit(1)
    const u = urows[0]
    if (!u?.referredBy || u.referralBonusGranted) return { granted: false }

    // 1ʳᵉ livraison uniquement (statut déjà mis à jour en "livree")
    const livreeCount = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(orderThreads)
      .where(and(eq(orderThreads.customerToken, t), eq(orderThreads.status, "livree")))
    if ((livreeCount[0]?.c ?? 0) !== 1) return { granted: false }

    const refRows = await db.select().from(users).where(eq(users.token, u.referredBy)).limit(1)
    const referrer = refRows[0]
    if (!referrer) {
      // Lien cassé : on marque quand même pour ne pas retenter indéfiniment
      await db.update(users).set({ referralBonusGranted: true }).where(eq(users.id, u.id))
      return { granted: false }
    }

    let referrerBonus = REFERRAL_BONUS_REFERRER
    try {
      // Platine = peak_tier ou CA ≥ 600€
      if ((referrer.peakTier as string) === "platinum") {
        referrerBonus += REFERRAL_BONUS_PLATINUM_EXTRA
      } else {
        const spentRows = await db
          .select({ s: sql<number>`coalesce(sum(${orderThreads.total}), 0)::int` })
          .from(orderThreads)
          .where(and(eq(orderThreads.customerToken, referrer.token), eq(orderThreads.status, "livree")))
        if ((spentRows[0]?.s ?? 0) >= 600) referrerBonus += REFERRAL_BONUS_PLATINUM_EXTRA
      }
    } catch {
      /* ignore */
    }

    const refereeBonus = REFERRAL_BONUS_REFEREE

    await db
      .update(users)
      .set({
        loyaltyAdjustment: (u.loyaltyAdjustment ?? 0) + refereeBonus,
        referralBonusGranted: true,
      })
      .where(eq(users.id, u.id))

    await db
      .update(users)
      .set({ loyaltyAdjustment: (referrer.loyaltyAdjustment ?? 0) + referrerBonus })
      .where(eq(users.id, referrer.id))

    await notifyVendor({
      title: "Bonus parrainage",
      body: `${u.pseudo} a validé sa 1ʳᵉ livraison — +${refereeBonus} pts filleul, +${referrerBonus} pts parrain (${referrer.pseudo}).`,
      url: "/admin",
      tag: `referral-${u.id}`,
    }).catch(() => {})

    // Push filleul + parrain (best-effort)
    try {
      const { notifyCustomer } = await import("@/lib/push")
      await notifyCustomer(u.token, {
        title: "Bonus parrainage",
        body: `+${refereeBonus} points pour ta 1ʳᵉ livraison ! Merci d'avoir rejoint via un parrain.`,
        url: "/",
        tag: `referral-referee-${u.id}`,
      })
      await notifyCustomer(referrer.token, {
        title: "Bonus parrainage",
        body: `${u.pseudo} a reçu sa 1ʳᵉ commande — +${referrerBonus} points pour toi !`,
        url: "/",
        tag: `referral-referrer-${u.id}`,
      })
    } catch {
      /* ignore */
    }

    return { granted: true, refereeBonus, referrerBonus }
  } catch (e) {
    console.error("[referral] grant on first delivery failed:", e)
    return { granted: false }
  }
}

// Récupère le compte associé à une clé secrète (connexion d'un client existant).
// Journalise la connexion (await obligatoire sur serverless — le fire-and-forget
// est tué dès que la server action renvoie sa réponse).
export async function getAccount(token: string) {
  const { normalizeSecretKey } = await import("@/lib/normalize-token")
  const t = normalizeSecretKey(token)
  if (!t) return null
  await ensureFeatureSchema()
  const rows = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const account = rows[0] ?? null
  if (account) {
    await recordLogin(t)
  }
  return account
}

// Garantit qu'un compte existe pour cette clé (migration des anciens comptes
// créés uniquement en localStorage avant l'introduction de la table users).
export async function ensureAccount(token: string, fallbackPseudo: string) {
  const account = await getAccount(token)
  if (account) return { ok: true as const, pseudo: account.pseudo, created: false }
  const res = await createAccount(token, fallbackPseudo)
  if (!res.ok) return { ok: false as const, error: res.error }
  return { ok: true as const, pseudo: res.pseudo, created: true }
}

export type CustomerStats = {
  points: number
  active: number
  past: number
  /** CA net livré (payé) */
  totalSpentDelivered: number
  /** CA qualifiant palier = net + remises fidélité (les bons n'effacent pas le statut) */
  qualifyingSpend: number
  tierId: LoyaltyTierId
  tierLabel: string
  tierEmoji: string
  pointsMultiplier: number
  priorityMessaging: boolean
  canReserve: boolean
  freeDeliveryActive: boolean
  freeDeliveryUntil: string | null
  freeDeliveryMinOrder: number
  fromPeak: boolean
  referralCode: string | null
  nextTierLabel: string | null
  spentToNext: number
  progress: number
  /** Texte court sur l'impact des bons */
  voucherPolicyHint: string
}

const VOUCHER_POLICY_HINT =
  "Les bons baissent les points de la commande (montant payé), mais ton palier ne redescend jamais. Le CA statut compte le panier avant remise fidélité."

/** Calcule points + CA qualifiant en rejouant les livraisons (multi palier). */
export function replayLoyaltyOrders(
  livreeOrders: {
    id: number
    total: number | null
    loyaltyDiscount?: number | null
    loyaltyPointsAwarded?: number | null
  }[],
  peakTierId?: string | null,
): { points: number; qualifyingSpend: number; netSpend: number } {
  const sorted = [...livreeOrders].sort((a, b) => a.id - b.id)
  let points = 0
  let qualifyingSpend = 0
  let netSpend = 0
  let runningQualifying = 0
  for (const o of sorted) {
    const net = Math.max(0, o.total ?? 0)
    const disc = Math.max(0, o.loyaltyDiscount ?? 0)
    const gross = net + disc
    const before = resolveEffectiveTier(runningQualifying, peakTierId)
    const awarded =
      o.loyaltyPointsAwarded != null && Number.isFinite(o.loyaltyPointsAwarded)
        ? Math.max(0, o.loyaltyPointsAwarded)
        : computeTierPoints(net, before.tier.pointsMultiplier)
    points += awarded
    netSpend += net
    qualifyingSpend += gross
    runningQualifying += gross
  }
  return { points, qualifyingSpend, netSpend }
}

// Statistiques réelles du client, calculées depuis ses commandes (clé secrète).
export async function getCustomerStats(token: string): Promise<CustomerStats> {
  const empty: CustomerStats = {
    points: 0,
    active: 0,
    past: 0,
    totalSpentDelivered: 0,
    qualifyingSpend: 0,
    tierId: "bronze",
    tierLabel: "Bronze",
    tierEmoji: "",
    pointsMultiplier: 1,
    priorityMessaging: false,
    canReserve: false,
    freeDeliveryActive: false,
    freeDeliveryUntil: null,
    freeDeliveryMinOrder: PLATINUM_FREE_DELIVERY_MIN,
    fromPeak: false,
    referralCode: null,
    nextTierLabel: "Argent",
    spentToNext: 100,
    progress: 0,
    voucherPolicyHint: VOUCHER_POLICY_HINT,
  }
  const t = token?.trim()
  if (!t) return empty

  await ensureFeatureSchema()

  const rows = await db.select().from(orderThreads).where(eq(orderThreads.customerToken, t))

  let active = 0
  let past = 0
  const livree: {
    id: number
    total: number | null
    loyaltyDiscount?: number | null
    loyaltyPointsAwarded?: number | null
  }[] = []
  for (const row of rows) {
    if (normalizeStatus(row.status) === "livree") {
      livree.push({
        id: row.id,
        total: row.total,
        loyaltyDiscount: (row as { loyaltyDiscount?: number | null }).loyaltyDiscount ?? 0,
        loyaltyPointsAwarded: (row as { loyaltyPointsAwarded?: number | null }).loyaltyPointsAwarded ?? null,
      })
    }
    if (isClosedStatus(row.status)) past += 1
    else active += 1
  }

  const account = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const u = account[0]
  const peakTier = (u?.peakTier as LoyaltyTierId) || "bronze"

  const replay = replayLoyaltyOrders(livree, peakTier)
  let points = Math.max(0, replay.points + (u?.loyaltyAdjustment ?? 0) - (u?.loyaltySpent ?? 0))

  let referralCode = u?.referralCode ?? null
  if (u && !referralCode) {
    referralCode = buildReferralCode(u.pseudo, u.id)
    try {
      await db.update(users).set({ referralCode }).where(eq(users.id, u.id))
    } catch {
      /* ignore */
    }
  }

  const resolved = resolveEffectiveTier(replay.qualifyingSpend, peakTier)

  // Maintient peak_tier + fenêtre livraison Platine
  if (u) {
    const newPeak = maxTierId(peakTier, resolved.tier.id)
    const patch: Partial<typeof users.$inferInsert> = {}
    if (newPeak !== peakTier) patch.peakTier = newPeak

    if (resolved.tier.id === "platinum" || newPeak === "platinum") {
      const until = u.freeDeliveryUntil ? new Date(u.freeDeliveryUntil) : null
      const now = new Date()
      if (!until || until.getTime() < now.getTime()) {
        const next = new Date(now.getTime() + FREE_DELIVERY_DAYS * 86400000)
        patch.freeDeliveryUntil = next
      }
    }
    if (Object.keys(patch).length > 0) {
      try {
        await db.update(users).set(patch).where(eq(users.id, u.id))
        if (patch.peakTier) (u as { peakTier: string }).peakTier = patch.peakTier as string
        if (patch.freeDeliveryUntil) (u as { freeDeliveryUntil: Date }).freeDeliveryUntil = patch.freeDeliveryUntil as Date
      } catch {
        /* ignore */
      }
    }
  }

  const freeUntil = u?.freeDeliveryUntil ? new Date(u.freeDeliveryUntil) : null
  const freeDeliveryActive =
    resolved.tier.freeDelivery && !!freeUntil && freeUntil.getTime() > Date.now()

  return {
    points,
    active,
    past,
    totalSpentDelivered: replay.netSpend,
    qualifyingSpend: replay.qualifyingSpend,
    tierId: resolved.tier.id,
    tierLabel: resolved.tier.label,
    tierEmoji: resolved.tier.emoji,
    pointsMultiplier: resolved.tier.pointsMultiplier,
    priorityMessaging: resolved.tier.priorityMessaging,
    canReserve: resolved.tier.canReserve,
    freeDeliveryActive,
    freeDeliveryUntil: freeUntil && freeDeliveryActive ? freeUntil.toISOString() : null,
    freeDeliveryMinOrder: resolved.tier.freeDeliveryMinOrder || PLATINUM_FREE_DELIVERY_MIN,
    fromPeak: resolved.fromPeak,
    referralCode,
    nextTierLabel: resolved.next?.label ?? null,
    spentToNext: resolved.spentToNext,
    progress: resolved.progress,
    voucherPolicyHint: VOUCHER_POLICY_HINT,
  }
}

/** Crédite les points d'une commande à la livraison (multi palier) + met à jour peak. */
export async function awardLoyaltyOnDelivery(opts: {
  customerToken: string | null | undefined
  orderId: number
  orderTotal: number
  loyaltyDiscount?: number
}): Promise<{ points: number; multiplier: number; tierLabel: string }> {
  const t = opts.customerToken?.trim()
  if (!t || !opts.orderId) return { points: 0, multiplier: 1, tierLabel: "Bronze" }
  await ensureFeatureSchema()

  const [u] = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const peakTier = (u?.peakTier as LoyaltyTierId) || "bronze"

  // CA qualifiant AVANT cette commande
  const prevLivree = await db
    .select({
      id: orderThreads.id,
      total: orderThreads.total,
      loyaltyDiscount: orderThreads.loyaltyDiscount,
      loyaltyPointsAwarded: orderThreads.loyaltyPointsAwarded,
      status: orderThreads.status,
    })
    .from(orderThreads)
    .where(and(eq(orderThreads.customerToken, t), eq(orderThreads.status, "livree")))

  const others = prevLivree.filter((o) => o.id !== opts.orderId)
  const before = replayLoyaltyOrders(others, peakTier)
  const eff = resolveEffectiveTier(before.qualifyingSpend, peakTier)
  const points = computeTierPoints(opts.orderTotal, eff.tier.pointsMultiplier)

  try {
    await db
      .update(orderThreads)
      .set({ loyaltyPointsAwarded: points })
      .where(eq(orderThreads.id, opts.orderId))
  } catch {
    /* colonne absente : ignore */
  }

  const afterSpend =
    before.qualifyingSpend + Math.max(0, opts.orderTotal) + Math.max(0, opts.loyaltyDiscount ?? 0)
  const afterTier = resolveEffectiveTier(afterSpend, peakTier)
  const newPeak = maxTierId(peakTier, afterTier.tier.id)

  if (u) {
    const patch: Record<string, unknown> = {}
    if (newPeak !== peakTier) patch.peakTier = newPeak
    if (afterTier.tier.id === "platinum" || newPeak === "platinum") {
      const until = u.freeDeliveryUntil ? new Date(u.freeDeliveryUntil) : null
      if (!until || until.getTime() < Date.now()) {
        patch.freeDeliveryUntil = new Date(Date.now() + FREE_DELIVERY_DAYS * 86400000)
      }
    }
    if (Object.keys(patch).length > 0) {
      try {
        await db.update(users).set(patch).where(eq(users.id, u.id))
      } catch {
        /* ignore */
      }
    }
  }

  return { points, multiplier: eff.tier.pointsMultiplier, tierLabel: eff.tier.label }
}

// --- Administration des comptes (réservé au panel admin) ---

export type AdminUserRow = {
  id: number
  pseudo: string
  token: string
  // Surnom interne admin uniquement — jamais exposé côté client.
  nickname: string | null
  createdAt: Date | string
  orderCount: number
  /** CA des commandes livrées uniquement (base des points fidélité) */
  totalSpent: number
  loyaltyAdjustment: number
  /** Points déjà échangés en codes */
  loyaltySpent: number
  flags: string[]
  // true si un rétablissement d'accès est en attente (le client doit encore définir son mdp)
  mustSetPassword: boolean
}

// Répertoire de tous les comptes enregistrés, avec nombre de commandes et total dépensé.
export async function listUsers(): Promise<AdminUserRow[]> {
  await ensureFeatureSchema()
  const rows = await db
    .select({
      id: users.id,
      pseudo: users.pseudo,
      token: users.token,
      nickname: users.nickname,
      createdAt: users.createdAt,
      loyaltyAdjustment: users.loyaltyAdjustment,
      loyaltySpent: users.loyaltySpent,
      flags: users.flags,
      mustSetPassword: users.mustSetPassword,
      // Commandes réelles uniquement (hors discussions / notifs / trk)
      orderCount: sql<number>`count(${orderThreads.id}) filter (
        where ${orderThreads.status} is not null
          and ${orderThreads.status} not in ('discussion','pris_en_charge','ouvert','ferme','notification','trk_token')
      )::int`,
      // Points fidélité = CA livré uniquement
      totalSpent: sql<number>`coalesce(sum(case when ${orderThreads.status} = 'livree' then ${orderThreads.total} else 0 end), 0)::int`,
    })
    .from(users)
    .leftJoin(orderThreads, eq(orderThreads.customerToken, users.token))
    .groupBy(
      users.id,
      users.pseudo,
      users.token,
      users.nickname,
      users.createdAt,
      users.loyaltyAdjustment,
      users.loyaltySpent,
      users.flags,
      users.mustSetPassword,
    )
    .orderBy(desc(users.createdAt))
  return rows
}

// Définit le surnom interne d'un compte (visible uniquement de l'admin).
export async function setUserNickname(id: number, nickname: string) {
  if (!id) return { ok: false as const }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const value = nickname.trim().slice(0, 60) || null
  await db.update(users).set({ nickname: value }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, nickname: value }
}

// Met à jour les étiquettes (flags) d'un compte client (réservé admin).
export async function setUserFlags(id: number, flags: string[]) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const clean = Array.from(new Set(flags.filter((f) => (USER_FLAGS as readonly string[]).includes(f))))
  await db.update(users).set({ flags: clean }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, flags: clean }
}

// Définit l'ajustement manuel des points fidélité d'un compte (réservé admin).
// adjustment = delta stocké en base ; l’UI calcule : points_affichés = CA_livré + adjustment − dépensés
export async function setLoyaltyAdjustment(id: number, adjustment: number) {
  if (!id || !Number.isFinite(adjustment)) return { ok: false as const }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const value = Math.trunc(adjustment)
  await db.update(users).set({ loyaltyAdjustment: value }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, loyaltyAdjustment: value }
}

// Supprime un compte et TOUTES les données associées au token (cascade complète).
// Tables purgées : orderThreads + threadMessages, userVerifications (+ Blobs),
// loyaltyCodes, promoUsages, userNewsReads, pushSubscriptions, restockAlerts.
export async function deleteUserAccount(id: number) {
  if (!id) return { ok: false as const }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }

  const row = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!row[0]) return { ok: false as const, error: "Introuvable." }
  const token = row[0].token

  await purgeUserData(token)

  revalidatePath("/admin")
  return { ok: true as const }
}

// Purge complète par token (utilisable aussi en interne, ex. rejectVerification).
export async function purgeUserData(token: string) {
  const t = token?.trim()
  if (!t) return

  // 1. Fichiers Blob de vérification d'identité
  const verifs = await db.select().from(userVerifications).where(eq(userVerifications.userToken, t))
  for (const v of verifs) {
    for (const path of [v.photoPathname, v.videoPathname]) {
      if (path) { try { await del(path) } catch { /* best-effort */ } }
    }
  }

  // 2. Messages de tous les fils de commande du token
  const threads = await db.select({ id: orderThreads.id }).from(orderThreads).where(eq(orderThreads.customerToken, t))
  if (threads.length > 0) {
    const threadIds = threads.map((t) => t.id)
    await db.delete(threadMessages).where(inArray(threadMessages.threadId, threadIds))
    await db.delete(orderThreads).where(eq(orderThreads.customerToken, t))
  }

  // 3. Toutes les autres tables liées au token
  await db.delete(userVerifications).where(eq(userVerifications.userToken, t))
  await db.delete(loyaltyCodes).where(eq(loyaltyCodes.userToken, t))
  await db.delete(promoUsages).where(eq(promoUsages.userToken, t))
  await db.delete(userNewsReads).where(eq(userNewsReads.userToken, t))
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.customerToken, t))
  await db.delete(restockAlerts).where(eq(restockAlerts.userToken, t))

  // 3b. Identifiants biométriques (WebAuthn)
  try {
    const { purgeWebAuthnForToken } = await import("@/app/actions/webauthn")
    await purgeWebAuthnForToken(t)
  } catch {
    /* best-effort */
  }

  // 4. Logs de connexion
  await deleteLoginLogsByToken(t)

  // 5. Marque le pseudo comme appartenant à un compte supprimé (ne l'efface PAS de reserved_pseudos).
  const userRow = await db.select({ pseudo: users.pseudo }).from(users).where(eq(users.token, t)).limit(1)
  if (userRow[0]) {
    await db.update(reservedPseudos)
      .set({ deletedAt: sql`now()` })
      .where(eq(reservedPseudos.pseudo, userRow[0].pseudo))
  }

  // 6. Compte utilisateur
  await db.delete(users).where(eq(users.token, t))
}
