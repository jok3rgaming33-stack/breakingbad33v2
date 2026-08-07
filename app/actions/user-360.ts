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
import { computeLoyaltyPoints, getLoyaltyTier, buildReferralCode } from "@/lib/loyalty"
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
  tier: ReturnType<typeof getLoyaltyTier>
  referralCode: string
  referredBy: string | null
  verification: { status: string; createdAt: Date | string; validatedAt: Date | string | null } | null
  recentLogins: User360Login[]
  orders: User360Order[]
  loyaltyCodes: { code: string; discount: number; used: boolean; createdAt: Date | string }[]
  unreadVendorMessages: number
  discussionCount: number
}

export async function getUser360(userId: number): Promise<User360Data | null> {
  if (!(await isAdminAuthenticated())) return null
  if (!userId) return null
  await ensureFeatureSchema()

  const urows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const u = urows[0]
  if (!u) return null

  // Garantit un code parrain
  let referralCode = u.referralCode
  if (!referralCode) {
    referralCode = buildReferralCode(u.pseudo, u.id)
    try {
      await db.update(users).set({ referralCode }).where(eq(users.id, u.id))
    } catch {
      /* race unique possible — on continue */
    }
  }

  const threads = await db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.customerToken, u.token))
    .orderBy(desc(orderThreads.updatedAt))

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
      summary: t.summary,
      total: t.total ?? 0,
      status: t.status,
      fulfillment: t.fulfillment,
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
  const tier = getLoyaltyTier(totalSpentDelivered)

  const [logs, verif, codes] = await Promise.all([
    db
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
      .limit(15),
    db
      .select({
        status: userVerifications.status,
        createdAt: userVerifications.createdAt,
        validatedAt: userVerifications.validatedAt,
      })
      .from(userVerifications)
      .where(eq(userVerifications.userToken, u.token))
      .limit(1),
    db
      .select({
        code: loyaltyCodes.code,
        discount: loyaltyCodes.discount,
        used: loyaltyCodes.used,
        createdAt: loyaltyCodes.createdAt,
      })
      .from(loyaltyCodes)
      .where(eq(loyaltyCodes.userToken, u.token))
      .orderBy(desc(loyaltyCodes.createdAt))
      .limit(20),
  ])

  // Messages vendeur non lus par le client (sur ses fils)
  const threadIds = threads.map((t) => t.id)
  let unreadVendorMessages = 0
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
    unreadVendorMessages = unread[0]?.c ?? 0
  }

  return {
    id: u.id,
    pseudo: u.pseudo,
    token: u.token,
    nickname: u.nickname,
    flags: Array.isArray(u.flags) ? u.flags : [],
    createdAt: u.createdAt,
    mustSetPassword: u.mustSetPassword,
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
    verification: verif[0]
      ? {
          status: verif[0].status,
          createdAt: verif[0].createdAt,
          validatedAt: verif[0].validatedAt,
        }
      : null,
    recentLogins: logs,
    orders: orderRows.slice(0, 30),
    loyaltyCodes: codes,
    unreadVendorMessages,
    discussionCount,
  }
}
