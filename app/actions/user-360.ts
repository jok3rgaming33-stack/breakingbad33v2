"use server"

import { db } from "@/lib/db"
import {
  users,
  orderThreads,
  loginLogs,
  userVerifications,
  loyaltyCodes,
  threadMessages,
} from "@/lib/db/schema"
import { eq, desc, and, sql, inArray } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { computeLoyaltyPoints, resolveEffectiveTier, buildReferralCode, type LoyaltyTierId } from "@/lib/loyalty"
import { normalizeStatus, isClosedStatus, isDiscussionStatus } from "@/lib/order-status"
import { ensureFeatureSchema } from "@/lib/feature-schema"

export type User360Order = {
  id: number
  summary: string
  total: number
  status: string
  fulfillment: string
  createdAt: Date | string
  updatedAt: Date | string
}

export type User360Login = {
  id: number
  ip: string | null
  city: string | null
  country: string | null
  userAgent: string | null
  createdAt: Date | string
}

export type User360Data = {
  id: number
  pseudo: string
  token: string
  nickname: string | null
  flags: string[]
  createdAt: Date | string
  mustSetPassword: boolean
  loyaltyAdjustment: number
  loyaltySpent: number
  points: number
  totalSpentDelivered: number
  orderCount: number
  activeOrders: number
  pastOrders: number
  tier: ReturnType<typeof resolveEffectiveTier>
  referralCode: string
  referredBy: string | null
  verification: { status: string; createdAt: Date | string; validatedAt: Date | string | null } | null
  recentLogins: User360Login[]
  orders: User360Order[]
  loyaltyCodes: { code: string; discount: number; used: boolean; createdAt: Date | string }[]
  unreadVendorMessages: number
  discussionCount: number
}

export type GetUser360Result =
  | { ok: true; data: User360Data }
  | { ok: false; error: string }

/**
 * Fiche client 360° — requêtes ciblées (pas de select *) pour éviter les
 * plantages si une colonne optionnelle manque encore en base.
 */
export async function getUser360(userId: number): Promise<GetUser360Result> {
  try {
    if (!(await isAdminAuthenticated())) {
      return { ok: false, error: "Non autorisé." }
    }
    if (!userId || !Number.isFinite(userId)) {
      return { ok: false, error: "Identifiant invalide." }
    }

    try {
      await ensureFeatureSchema()
    } catch (e) {
      console.error("[user-360] ensureFeatureSchema:", e)
    }

    // Colonnes strictement nécessaires (évite select * sur order_threads/users)
    const urows = await db
      .select({
        id: users.id,
        pseudo: users.pseudo,
        token: users.token,
        nickname: users.nickname,
        flags: users.flags,
        createdAt: users.createdAt,
        mustSetPassword: users.mustSetPassword,
        loyaltyAdjustment: users.loyaltyAdjustment,
        loyaltySpent: users.loyaltySpent,
        referralCode: users.referralCode,
        referredBy: users.referredBy,
        peakTier: users.peakTier,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const u = urows[0]
    if (!u) return { ok: false, error: "Profil introuvable." }

    let referralCode = u.referralCode
    if (!referralCode) {
      referralCode = buildReferralCode(u.pseudo, u.id)
      try {
        await db.update(users).set({ referralCode }).where(eq(users.id, u.id))
      } catch {
        /* race unique possible */
      }
    }

    const threads = await db
      .select({
        id: orderThreads.id,
        summary: orderThreads.summary,
        total: orderThreads.total,
        status: orderThreads.status,
        fulfillment: orderThreads.fulfillment,
        createdAt: orderThreads.createdAt,
        updatedAt: orderThreads.updatedAt,
      })
      .from(orderThreads)
      .where(eq(orderThreads.customerToken, u.token))
      .orderBy(desc(orderThreads.updatedAt))
      .limit(80)

    let pointsFromOrders = 0
    let totalSpentDelivered = 0
    let activeOrders = 0
    let pastOrders = 0
    let discussionCount = 0
    const orderRows: User360Order[] = []

    for (const t of threads) {
      if (isDiscussionStatus(t.status) || t.status === "notification" || t.status === "trk_token") {
        if (isDiscussionStatus(t.status)) discussionCount += 1
        continue
      }
      orderRows.push({
        id: t.id,
        summary: t.summary || "",
        total: t.total ?? 0,
        status: t.status || "en_attente",
        fulfillment: t.fulfillment || "livraison",
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })
      if (normalizeStatus(t.status) === "livree") {
        pointsFromOrders += computeLoyaltyPoints(t.total ?? 0)
        totalSpentDelivered += t.total ?? 0
      }
      if (isClosedStatus(t.status)) pastOrders += 1
      else activeOrders += 1
    }

    const points = Math.max(
      0,
      pointsFromOrders + (u.loyaltyAdjustment ?? 0) - (u.loyaltySpent ?? 0),
    )
    const tier = resolveEffectiveTier(totalSpentDelivered, (u.peakTier as LoyaltyTierId) || "bronze")

    // Secondaires : une erreur ne doit pas casser toute la fiche
    let logs: User360Login[] = []
    let verif: User360Data["verification"] = null
    let codes: User360Data["loyaltyCodes"] = []
    let unreadVendorMessages = 0

    try {
      logs = await db
        .select({
          id: loginLogs.id,
          ip: loginLogs.ip,
          city: loginLogs.city,
          country: loginLogs.country,
          userAgent: loginLogs.userAgent,
          createdAt: loginLogs.createdAt,
        })
        .from(loginLogs)
        .where(eq(loginLogs.userToken, u.token))
        .orderBy(desc(loginLogs.createdAt))
        .limit(12)
    } catch (e) {
      console.error("[user-360] login logs:", e)
    }

    try {
      const vrows = await db
        .select({
          status: userVerifications.status,
          createdAt: userVerifications.createdAt,
          validatedAt: userVerifications.validatedAt,
        })
        .from(userVerifications)
        .where(eq(userVerifications.userToken, u.token))
        .limit(1)
      if (vrows[0]) {
        verif = {
          status: vrows[0].status,
          createdAt: vrows[0].createdAt,
          validatedAt: vrows[0].validatedAt,
        }
      }
    } catch (e) {
      console.error("[user-360] verification:", e)
    }

    try {
      codes = await db
        .select({
          code: loyaltyCodes.code,
          discount: loyaltyCodes.discount,
          used: loyaltyCodes.used,
          createdAt: loyaltyCodes.createdAt,
        })
        .from(loyaltyCodes)
        .where(eq(loyaltyCodes.userToken, u.token))
        .orderBy(desc(loyaltyCodes.createdAt))
        .limit(15)
    } catch (e) {
      console.error("[user-360] loyalty codes:", e)
    }

    try {
      const threadIds = threads.map((t) => t.id)
      if (threadIds.length > 0) {
        const unread = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(threadMessages)
          .where(
            and(
              inArray(threadMessages.threadId, threadIds),
              eq(threadMessages.sender, "vendeur"),
              sql`${threadMessages.clientReadAt} IS NULL`,
            ),
          )
        unreadVendorMessages = Number(unread[0]?.c ?? 0)
      }
    } catch (e) {
      console.error("[user-360] unread:", e)
      unreadVendorMessages = 0
    }

    const data: User360Data = {
      id: u.id,
      pseudo: u.pseudo,
      token: u.token,
      nickname: u.nickname,
      flags: Array.isArray(u.flags) ? u.flags : [],
      createdAt: u.createdAt,
      mustSetPassword: !!u.mustSetPassword,
      loyaltyAdjustment: u.loyaltyAdjustment ?? 0,
      loyaltySpent: u.loyaltySpent ?? 0,
      points,
      totalSpentDelivered,
      orderCount: orderRows.length,
      activeOrders,
      pastOrders,
      tier,
      referralCode: referralCode || "",
      referredBy: u.referredBy ?? null,
      verification: verif,
      recentLogins: logs,
      orders: orderRows.slice(0, 20),
      loyaltyCodes: codes,
      unreadVendorMessages,
      discussionCount,
    }

    return { ok: true, data }
  } catch (e) {
    console.error("[user-360] getUser360 failed:", e)
    const msg = e instanceof Error ? e.message : "Erreur serveur"
    // Message court côté UI (pas de stack)
    return {
      ok: false,
      error: msg.includes("column")
        ? "Schéma base incomplet — réessaie dans quelques secondes."
        : "Erreur de chargement du profil.",
    }
  }
}
