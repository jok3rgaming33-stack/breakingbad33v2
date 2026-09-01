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
  replayLoyaltyOrders,
  maxTierId,
  buildReferralCode,
  normalizeReferralCode,
  PLATINUM_FREE_DELIVERY_MIN,
  PLATINUM_FREE_DELIVERY_POINTS_COST,
  shouldGrantPlatinumFreeMonth,
  computeFreeDeliveryUntil,
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

  try {
    await ensureFeatureSchema()
  } catch {
    /* soft — ne bloque pas la création */
  }

  const existing = await db.select().from(users).where(eq(users.token, t)).limit(1)
  if (existing.length > 0) {
    // Journal soft : ne doit jamais empêcher la reconnexion d'un compte existant
    try {
      await recordLogin(t)
    } catch {
      /* soft */
    }
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

  // Parrain optionnel : code invalide / vide = on crée quand même le compte (non bloquant)
  let referrer: typeof users.$inferSelect | null = null
  let referralIgnored = false
  const refCode = normalizeReferralCode(referralCode)
  if (refCode) {
    try {
      // 1) Match normalisé (casse / espaces / tirets)
      let refRows = await db
        .select()
        .from(users)
        .where(sql`upper(replace(trim(${users.referralCode}), ' ', '')) = ${refCode}`)
        .limit(1)
      // 2) Fallback exact (codes déjà stockés en majuscules)
      if (!refRows[0]) {
        refRows = await db.select().from(users).where(eq(users.referralCode, refCode)).limit(1)
      }
      if (refRows[0] && refRows[0].token !== t) {
        referrer = refRows[0]
      } else {
        referralIgnored = true // saisi mais inconnu / auto-réf
      }
    } catch (e) {
      console.error("[account] referral lookup failed:", e)
      referralIgnored = true
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
  let ownReferralCode: string | null = null
  if (newId) {
    ownReferralCode = buildReferralCode(p, newId)
    try {
      await db.update(users).set({ referralCode: ownReferralCode }).where(eq(users.id, newId))
    } catch (e) {
      console.error("[account] set referralCode on create:", e)
      // Réessaie une fois après ensure schema
      try {
        await ensureFeatureSchema()
        await db.update(users).set({ referralCode: ownReferralCode }).where(eq(users.id, newId))
      } catch (e2) {
        console.error("[account] set referralCode retry failed:", e2)
      }
    }
  }

  // Journalise l'IP pour faire respecter la limite mensuelle (soft : compte déjà créé).
  if (ip) {
    try {
      await db.insert(accountCreations).values({ ip })
    } catch (e) {
      console.error("[account] accountCreations insert failed:", e)
    }
  }

  // Tout ce qui suit est optionnel : le compte existe déjà en base.
  // Un échec ici ne doit JAMAIS faire croire au client que la création a échoué.

  // Message de bienvenue + bon de réduction unique (discussion vendeur → client).
  try {
    await sendWelcomePackage({ pseudo: p, token: t })
  } catch (e) {
    console.error("[account] welcome package failed:", e)
  }

  // Notifie le vendeur de l'arrivée d'un nouveau membre.
  try {
    await notifyVendor({
      title: "Nouveau membre",
      body: referrer
        ? `${p} vient de créer un compte (parrainé par ${referrer.pseudo} — bonus à la 1ʳᵉ livraison).`
        : `${p} vient de créer un compte.`,
      url: "/admin",
      tag: "new-member",
    })
  } catch (e) {
    console.error("[account] notifyVendor new member failed:", e)
  }

  // Première connexion = création de compte (getAccount n'est pas appelé ici)
  try {
    await recordLogin(t)
  } catch {
    /* soft */
  }

  return {
    ok: true as const,
    pseudo: p,
    referralLinked: !!referrer,
    /** true si un code a été saisi mais non reconnu — compte créé quand même */
    referralIgnored,
    referralCode: ownReferralCode,
  }
}

/** Génère un code promo unique (10€ / min 80€) et l'envoie en messagerie « Discussion ». */
async function sendWelcomePackage(opts: { pseudo: string; token: string }) {
  const { pseudo, token } = opts

  // 1) Bon à usage unique, lié au compte (même pipeline que les codes fidélité).
  let promoCode = ""
  for (let attempt = 0; attempt < 6; attempt++) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()
    const candidate = `BB33-W-${random}`
    try {
      await db.insert(loyaltyCodes).values({
        userToken: token,
        code: candidate,
        discount: 10,
        pointsCost: 0,
        minAmount: 80,
        used: false,
      })
      promoCode = candidate
      break
    } catch {
      // collision de code unique → on réessaie
    }
  }
  if (!promoCode) {
    throw new Error("Impossible de générer un code de bienvenue unique")
  }

  // 2) Fil de discussion + message du chimiste.
  const body = [
    "Bienvenue chez BreakingBad33,",
    "",
    "Nous sommes heureux de t'accueillir.",
    "",
    'Contacte-nous si besoin, sinon tu trouveras toutes les infos utiles dans la section « Comment ça marche ».',
    "",
    "En guise de cadeau de bienvenue, voici un bon de réduction de 10€ à valoir sur ta 1ère commande (montant minimum 80€) :",
    "",
    `🎟 Code : ${promoCode}`,
    "",
    "Saisis-le dans ton panier au moment de la commande (usage unique).",
    "",
    "Au plaisir,",
    "",
    "Le chimiste",
  ].join("\n")

  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: pseudo,
      customerToken: token,
      trackingToken: `MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
      summary: "Bienvenue",
      total: 0,
      fulfillment: "livraison",
      status: "discussion",
    })
    .returning({ id: orderThreads.id })

  if (!thread) throw new Error("Fil de bienvenue non créé")

  await db.insert(threadMessages).values({
    threadId: thread.id,
    sender: "vendeur",
    body,
  })

  // Push optionnel (souvent pas encore d'abonnement à la création).
  try {
    const { notifyCustomer } = await import("@/lib/push")
    const { clientThreadUrl } = await import("@/lib/deep-links")
    await notifyCustomer(token, {
      title: "Bienvenue chez BreakingBad33",
      body: "Un message t'attend dans Messagerie — cadeau de bienvenue inclus.",
      url: clientThreadUrl("messaging", thread.id),
      tag: `welcome-${thread.id}`,
      threadId: thread.id,
      open: "messaging",
    })
  } catch {
    /* soft */
  }

  revalidatePath("/messagerie")
  revalidatePath("/")
}

/**
 * Garantit et renvoie le code parrain d'un utilisateur (génère si absent).
 * Utilisé par l'Espace fidélité pour toujours afficher un code.
 */
export async function ensureReferralCode(token: string): Promise<{
  ok: boolean
  code: string | null
  error?: string
}> {
  const t = token?.trim()
  if (!t) return { ok: false, code: null, error: "Session invalide" }
  try {
    await ensureFeatureSchema()
    const rows = await db
      .select({
        id: users.id,
        pseudo: users.pseudo,
        referralCode: users.referralCode,
      })
      .from(users)
      .where(eq(users.token, t))
      .limit(1)
    const u = rows[0]
    if (!u) return { ok: false, code: null, error: "Compte introuvable" }

    if (u.referralCode?.trim()) {
      return { ok: true, code: u.referralCode.trim().toUpperCase() }
    }

    const code = buildReferralCode(u.pseudo, u.id)
    try {
      await db.update(users).set({ referralCode: code }).where(eq(users.id, u.id))
      return { ok: true, code }
    } catch (e) {
      console.error("[account] ensureReferralCode update:", e)
      // En cas de collision unique rare : suffixe alternatif
      const alt = `${code.slice(0, -1)}${String(u.id % 36).toUpperCase()}`
      try {
        await db.update(users).set({ referralCode: alt }).where(eq(users.id, u.id))
        return { ok: true, code: alt }
      } catch (e2) {
        console.error("[account] ensureReferralCode alt failed:", e2)
        return { ok: true, code } // affiche quand même le code calculé
      }
    }
  } catch (e) {
    console.error("[account] ensureReferralCode:", e)
    return { ok: false, code: null, error: "Impossible de charger le code parrain." }
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
// Le journal de connexion est best-effort : un échec n'empêche JAMAIS le login.
export async function getAccount(token: string) {
  const { normalizeSecretKey } = await import("@/lib/normalize-token")
  const t = normalizeSecretKey(token)
  if (!t) return null
  try {
    await ensureFeatureSchema()
  } catch {
    /* soft */
  }
  const rows = await db.select().from(users).where(eq(users.token, t)).limit(1)
  const account = rows[0] ?? null
  if (account) {
    // Soft total : jamais d'échec de login à cause des logs / géoloc / schéma
    try {
      await recordLogin(t)
    } catch (e) {
      console.error("[account] recordLogin on getAccount soft-fail:", e)
    }
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
  /** Fin du mois offert (ISO) — présent même si expiré, pour l'UI */
  freeDeliveryUntil: string | null
  freeDeliveryMinOrder: number
  /** Platine + mois offert terminé */
  freeDeliveryExpired: boolean
  /** Peut payer 150 pts pour une livraison offerte (platine hors mois gratuit) */
  canRedeemFreeDelivery: boolean
  freeDeliveryPointsCost: number
  fromPeak: boolean
  referralCode: string | null
  nextTierLabel: string | null
  spentToNext: number
  progress: number
  /** Texte court sur l'impact des bons */
  voucherPolicyHint: string
}

const VOUCHER_POLICY_HINT =
  "Les bons baissent les points de la commande (montant payé), mais ton palier ne redescend jamais. Les paliers suivent tes points de statut (1€ hors remise fidélité = 1 pt statut)."

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
    freeDeliveryExpired: false,
    canRedeemFreeDelivery: false,
    freeDeliveryPointsCost: PLATINUM_FREE_DELIVERY_POINTS_COST,
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

  // Select ciblé (évite plantage si une colonne optionnelle manque encore)
  let u: {
    id: number
    pseudo: string
    loyaltyAdjustment: number | null
    loyaltySpent: number | null
    referralCode: string | null
    peakTier: string | null
    freeDeliveryUntil: Date | null
  } | null = null
  try {
    const account = await db
      .select({
        id: users.id,
        pseudo: users.pseudo,
        loyaltyAdjustment: users.loyaltyAdjustment,
        loyaltySpent: users.loyaltySpent,
        referralCode: users.referralCode,
        peakTier: users.peakTier,
        freeDeliveryUntil: users.freeDeliveryUntil,
      })
      .from(users)
      .where(eq(users.token, t))
      .limit(1)
    u = account[0] ?? null
  } catch (e) {
    console.error("[account] getCustomerStats user select:", e)
    try {
      // Fallback SQL brut — ne jamais perdre le peak_tier Platine
      const raw = await db.execute(sql`
        SELECT id, pseudo, loyalty_adjustment, loyalty_spent, referral_code, peak_tier, free_delivery_until
        FROM users WHERE token = ${t} LIMIT 1
      `)
      const row = ((raw as { rows?: Record<string, unknown>[] }).rows ?? [])[0]
      if (row) {
        u = {
          id: Number(row.id),
          pseudo: String(row.pseudo),
          loyaltyAdjustment: Number(row.loyalty_adjustment ?? 0),
          loyaltySpent: Number(row.loyalty_spent ?? 0),
          referralCode: row.referral_code != null ? String(row.referral_code) : null,
          peakTier: String(row.peak_tier || "bronze"),
          freeDeliveryUntil: row.free_delivery_until
            ? new Date(String(row.free_delivery_until))
            : null,
        }
      }
    } catch (e2) {
      console.error("[account] getCustomerStats user fallback:", e2)
    }
  }

  const peakTier = (u?.peakTier as LoyaltyTierId) || "bronze"

  const replay = replayLoyaltyOrders(livree, peakTier)
  let points = Math.max(0, replay.points + (u?.loyaltyAdjustment ?? 0) - (u?.loyaltySpent ?? 0))

  // Code parrain : toujours généré / renvoyé
  let referralCode = u?.referralCode?.trim() || null
  if (u && !referralCode) {
    const ensured = await ensureReferralCode(t)
    referralCode = ensured.code
  }

  const resolved = resolveEffectiveTier(replay.qualifyingSpend, peakTier)

  // Maintient peak_tier + fenêtre livraison Platine
  if (u) {
    const newPeak = maxTierId(peakTier, resolved.tier.id)
    const patch: Partial<typeof users.$inferInsert> = {}
    if (newPeak !== peakTier) patch.peakTier = newPeak

    const isPlatinum = resolved.tier.id === "platinum" || newPeak === "platinum"
    if (isPlatinum) {
      const wasAlreadyPlatinum = peakTier === "platinum"
      if (
        shouldGrantPlatinumFreeMonth({
          wasAlreadyPlatinum,
          freeDeliveryUntil: u.freeDeliveryUntil,
        })
      ) {
        // 1ʳᵉ fois platine OU platine legacy sans date → démarre le mois offert (une seule fois)
        patch.freeDeliveryUntil = computeFreeDeliveryUntil()
      }
    }
    let grantedFreeMonth = false
    if (Object.keys(patch).length > 0) {
      try {
        await db.update(users).set(patch).where(eq(users.id, u.id))
        if (patch.peakTier) (u as { peakTier: string }).peakTier = patch.peakTier as string
        if (patch.freeDeliveryUntil) {
          ;(u as { freeDeliveryUntil: Date }).freeDeliveryUntil = patch.freeDeliveryUntil as Date
          grantedFreeMonth = true
        }
      } catch {
        /* ignore */
      }
    }
    if (grantedFreeMonth) {
      try {
        const { onPlatinumFreeMonthGranted } = await import("@/app/actions/platinum-delivery-notifs")
        await onPlatinumFreeMonthGranted(u.id)
      } catch {
        /* soft */
      }
    }
  }

  const freeUntil = u?.freeDeliveryUntil ? new Date(u.freeDeliveryUntil) : null
  const isPlatinumNow = resolved.tier.id === "platinum"
  const freeDeliveryActive =
    isPlatinumNow && !!freeUntil && freeUntil.getTime() > Date.now()
  const freeDeliveryExpired =
    isPlatinumNow && !!freeUntil && freeUntil.getTime() <= Date.now()
  const canRedeemFreeDelivery =
    isPlatinumNow && !freeDeliveryActive && points >= PLATINUM_FREE_DELIVERY_POINTS_COST

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
    freeDeliveryUntil: freeUntil ? freeUntil.toISOString() : null,
    freeDeliveryMinOrder: resolved.tier.freeDeliveryMinOrder || PLATINUM_FREE_DELIVERY_MIN,
    freeDeliveryExpired,
    canRedeemFreeDelivery,
    freeDeliveryPointsCost: PLATINUM_FREE_DELIVERY_POINTS_COST,
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
      if (
        shouldGrantPlatinumFreeMonth({
          wasAlreadyPlatinum: peakTier === "platinum",
          freeDeliveryUntil: u.freeDeliveryUntil,
        })
      ) {
        patch.freeDeliveryUntil = computeFreeDeliveryUntil()
      }
    }
    let grantedFreeMonth = false
    if (Object.keys(patch).length > 0) {
      try {
        await db.update(users).set(patch).where(eq(users.id, u.id))
        if (patch.freeDeliveryUntil) grantedFreeMonth = true
      } catch {
        /* ignore */
      }
    }
    if (grantedFreeMonth) {
      try {
        const { onPlatinumFreeMonthGranted } = await import("@/app/actions/platinum-delivery-notifs")
        await onPlatinumFreeMonthGranted(u.id)
      } catch {
        /* soft */
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
  excludeNews: boolean
  excludeNotifications: boolean
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
  /** Statut KYC : pending | validated | null si aucune soumission */
  kycStatus: string | null
  /** ID user_verifications pour validation rapide depuis le répertoire */
  kycId: number | null
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
      excludeNews: users.excludeNews,
      excludeNotifications: users.excludeNotifications,
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
      users.excludeNews,
      users.excludeNotifications,
      users.createdAt,
      users.loyaltyAdjustment,
      users.loyaltySpent,
      users.flags,
      users.mustSetPassword,
    )
    .orderBy(desc(users.createdAt))

  // Enrichissement KYC (hors groupBy pour rester simple / robuste)
  let kycByToken = new Map<string, { id: number; status: string }>()
  try {
    const kycRows = await db
      .select({
        id: userVerifications.id,
        userToken: userVerifications.userToken,
        status: userVerifications.status,
      })
      .from(userVerifications)
    kycByToken = new Map(kycRows.map((k) => [k.userToken, { id: k.id, status: k.status }]))
  } catch (e) {
    console.error("[listUsers] kyc enrich failed:", e)
  }

  return rows.map((r) => {
    const kyc = kycByToken.get(r.token)
    return {
      ...r,
      kycStatus: kyc?.status ?? null,
      kycId: kyc?.id ?? null,
    }
  })
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

// Met à jour les préférences d'envoi d'un compte client (réservé admin).
export async function setUserDeliveryPreferences(
  id: number,
  preference: "excludeNews" | "excludeNotifications",
  value: boolean,
) {
  if (!id || !["excludeNews", "excludeNotifications"].includes(preference)) {
    return { ok: false as const, error: "Paramètres invalides." }
  }
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await db.update(users).set({ [preference]: Boolean(value) }).where(eq(users.id, id))
  revalidatePath("/admin")
  return { ok: true as const, preference, value: Boolean(value) }
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
