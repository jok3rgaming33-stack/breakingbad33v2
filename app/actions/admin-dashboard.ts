"use server"

import { db } from "@/lib/db"
import {
  users,
  orderThreads,
  loginLogs,
  userVerifications,
  threadMessages,
} from "@/lib/db/schema"
import { and, eq, gte, sql, notInArray, ne, desc } from "drizzle-orm"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { processLockerReminders } from "@/app/actions/locker-reminders"
import { ensureFeatureSchema } from "@/lib/feature-schema"

const DISCUSSION_STATUSES = ["discussion", "pris_en_charge", "ouvert", "ferme"] as const

export type AdminDashboardData = {
  ordersActive: number
  lockerActive: number
  discussionsOpen: number
  verificationsPending: number
  logins24h: number
  loginsToday: number
  newUsers7d: number
  unreadClientMessages: number
  revenueDelivered30d: number
  ordersDelivered30d: number
  recentLogins: {
    id: number
    pseudo: string
    city: string | null
    country: string | null
    createdAt: Date | string
  }[]
  recentOrders: {
    id: number
    customerName: string
    total: number
    status: string
    fulfillment: string
    updatedAt: Date | string
  }[]
  lockerReminders: { sent: number; checked: number }
  generatedAt: string
}

export async function getAdminDashboard(): Promise<AdminDashboardData | null> {
  if (!(await isAdminAuthenticated())) return null
  try {
    await ensureFeatureSchema()
  } catch {
    /* schema best-effort */
  }

  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Rappels locker + notifs Platine en arrière-plan : NE PAS await (web-push peut pendre).
  const lockerReminders = { sent: 0, checked: 0 }
  void processLockerReminders()
    .then((r) => {
      if (r.sent > 0) console.log("[dashboard] locker reminders sent:", r.sent)
    })
    .catch((e) => console.error("[dashboard] locker reminders:", e))
  void import("@/app/actions/platinum-delivery-notifs")
    .then(({ processPlatinumFreeDeliveryNotifs }) => processPlatinumFreeDeliveryNotifs())
    .then((r) => {
      if (r.startSent || r.endingSent) console.log("[dashboard] platinum notifs:", r)
    })
    .catch((e) => console.error("[dashboard] platinum notifs:", e))

  const [
    ordersActiveRow,
    lockerActiveRow,
    discussionsRow,
    verifRow,
    logins24Row,
    loginsTodayRow,
    newUsersRow,
    unreadRow,
    revenueRow,
    recentLogins,
    recentOrders,
  ] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(orderThreads)
      .where(
        and(
          notInArray(orderThreads.status, ["livree", "annulee", "notification", "trk_token", ...DISCUSSION_STATUSES]),
          ne(orderThreads.fulfillment, "locker"),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(orderThreads)
      .where(
        and(
          eq(orderThreads.fulfillment, "locker"),
          notInArray(orderThreads.status, ["livree", "annulee", "trk_token", ...DISCUSSION_STATUSES]),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(orderThreads)
      .where(
        and(
          sql`${orderThreads.status} IN ('discussion', 'pris_en_charge', 'ouvert')`,
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(userVerifications)
      .where(eq(userVerifications.status, "pending")),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(loginLogs)
      .where(gte(loginLogs.createdAt, h24)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(loginLogs)
      .where(gte(loginLogs.createdAt, dayStart)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.createdAt, d7)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(threadMessages)
      .innerJoin(orderThreads, eq(threadMessages.threadId, orderThreads.id))
      .where(
        and(
          eq(threadMessages.sender, "client"),
          // proxy "non traité" : messages clients des 48 h sur fils non clôturés
          gte(threadMessages.createdAt, new Date(now.getTime() - 48 * 60 * 60 * 1000)),
          notInArray(orderThreads.status, ["livree", "annulee", "ferme"]),
        ),
      ),
    db
      .select({
        revenue: sql<number>`coalesce(sum(${orderThreads.total}), 0)::int`,
        orders: sql<number>`count(*)::int`,
      })
      .from(orderThreads)
      .where(
        and(eq(orderThreads.status, "livree"), gte(orderThreads.updatedAt, d30)),
      ),
    db
      .select({
        id: loginLogs.id,
        pseudo: loginLogs.pseudo,
        city: loginLogs.city,
        country: loginLogs.country,
        createdAt: loginLogs.createdAt,
      })
      .from(loginLogs)
      .orderBy(desc(loginLogs.createdAt))
      .limit(8),
    db
      .select({
        id: orderThreads.id,
        customerName: orderThreads.customerName,
        total: orderThreads.total,
        status: orderThreads.status,
        fulfillment: orderThreads.fulfillment,
        updatedAt: orderThreads.updatedAt,
      })
      .from(orderThreads)
      .where(
        notInArray(orderThreads.status, ["notification", "trk_token", ...DISCUSSION_STATUSES]),
      )
      .orderBy(desc(orderThreads.updatedAt))
      .limit(8),
  ])

  return {
    ordersActive: ordersActiveRow[0]?.c ?? 0,
    lockerActive: lockerActiveRow[0]?.c ?? 0,
    discussionsOpen: discussionsRow[0]?.c ?? 0,
    verificationsPending: verifRow[0]?.c ?? 0,
    logins24h: logins24Row[0]?.c ?? 0,
    loginsToday: loginsTodayRow[0]?.c ?? 0,
    newUsers7d: newUsersRow[0]?.c ?? 0,
    unreadClientMessages: unreadRow[0]?.c ?? 0,
    revenueDelivered30d: revenueRow[0]?.revenue ?? 0,
    ordersDelivered30d: revenueRow[0]?.orders ?? 0,
    recentLogins,
    recentOrders,
    lockerReminders,
    generatedAt: now.toISOString(),
  }
}
