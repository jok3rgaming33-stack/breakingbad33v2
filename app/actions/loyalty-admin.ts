"use server"

import { db } from "@/lib/db"
import { loyaltyCodes, orderThreads, users } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { normalizeStatus } from "@/lib/order-status"
import { desc, eq, inArray, sql } from "drizzle-orm"

export type LoyaltyOrderLine = {
  orderId: number
  total: number
  points: number
  status: string
  fulfillment: string
  deliveredAt: Date | string | null
  summary: string | null
}

export type LoyaltyCodeLine = {
  id: number
  code: string
  discount: number
  pointsCost: number
  minAmount: number
  used: boolean
  createdAt: Date | string
  userToken: string
  pseudo: string | null
}

export type LoyaltyClientRow = {
  userId: number
  pseudo: string
  token: string
  nickname: string | null
  /** Points gagnés sur commandes livrées (1€ = 1 pt) */
  earned: number
  loyaltyAdjustment: number
  loyaltySpent: number
  /** Solde affiché client : max(0, earned + adj - spent) */
  balance: number
  /** Somme des pointsCost des codes générés */
  codesPointsCost: number
  codesCount: number
  codesUsed: number
  codesUnused: number
  /** true si loyaltySpent === somme des codes (débit OK) */
  debitOk: boolean
  /** true si balance cohérent avec la formule */
  balanceOk: boolean
  ordersDelivered: number
  orderLines: LoyaltyOrderLine[]
  codeLines: LoyaltyCodeLine[]
}

export type LoyaltyOverview = {
  clients: LoyaltyClientRow[]
  allCodes: LoyaltyCodeLine[]
  totals: {
    clients: number
    earned: number
    spent: number
    balance: number
    codesTotal: number
    codesUsed: number
    codesUnused: number
    anomalies: number
  }
}

function shortToken(t: string) {
  if (!t) return "—"
  return t.length > 16 ? `${t.slice(0, 8)}…${t.slice(-6)}` : t
}

/**
 * Vue admin fidélité :
 * - attribution points par commande livrée
 * - codes générés / utilisés
 * - contrôle solde vs loyaltySpent vs somme des codes
 */
export async function getLoyaltyOverview(): Promise<LoyaltyOverview> {
  if (!(await isAdminAuthenticated())) {
    return {
      clients: [],
      allCodes: [],
      totals: {
        clients: 0,
        earned: 0,
        spent: 0,
        balance: 0,
        codesTotal: 0,
        codesUsed: 0,
        codesUnused: 0,
        anomalies: 0,
      },
    }
  }

  const allUsers = await db
    .select({
      id: users.id,
      pseudo: users.pseudo,
      token: users.token,
      nickname: users.nickname,
      loyaltyAdjustment: users.loyaltyAdjustment,
      loyaltySpent: users.loyaltySpent,
    })
    .from(users)
    .orderBy(desc(users.createdAt))

  const tokens = allUsers.map((u) => u.token).filter(Boolean)

  // Commandes livrées (crédits points)
  const orders =
    tokens.length > 0
      ? await db
          .select({
            id: orderThreads.id,
            customerToken: orderThreads.customerToken,
            total: orderThreads.total,
            status: orderThreads.status,
            fulfillment: orderThreads.fulfillment,
            summary: orderThreads.summary,
            updatedAt: orderThreads.updatedAt,
          })
          .from(orderThreads)
          .where(
            tokens.length === 1
              ? eq(orderThreads.customerToken, tokens[0])
              : inArray(orderThreads.customerToken, tokens),
          )
      : []

  // Tous les codes fidélité
  const codesRaw = await db.select().from(loyaltyCodes).orderBy(desc(loyaltyCodes.createdAt))

  const pseudoByToken = new Map(allUsers.map((u) => [u.token, u.pseudo]))

  const codesByToken = new Map<string, LoyaltyCodeLine[]>()
  const allCodes: LoyaltyCodeLine[] = codesRaw.map((c) => {
    const line: LoyaltyCodeLine = {
      id: c.id,
      code: c.code,
      discount: c.discount,
      pointsCost: c.pointsCost,
      minAmount: c.minAmount,
      used: c.used,
      createdAt: c.createdAt,
      userToken: c.userToken,
      pseudo: pseudoByToken.get(c.userToken) ?? null,
    }
    const list = codesByToken.get(c.userToken) ?? []
    list.push(line)
    codesByToken.set(c.userToken, list)
    return line
  })

  const ordersByToken = new Map<string, LoyaltyOrderLine[]>()
  for (const o of orders) {
    if (!o.customerToken) continue
    if (normalizeStatus(o.status) !== "livree") continue
    const pts = computeLoyaltyPoints(o.total ?? 0)
    if (pts <= 0 && (o.total ?? 0) <= 0) continue
    const line: LoyaltyOrderLine = {
      orderId: o.id,
      total: o.total ?? 0,
      points: pts,
      status: o.status,
      fulfillment: o.fulfillment,
      deliveredAt: o.updatedAt,
      summary: o.summary,
    }
    const list = ordersByToken.get(o.customerToken) ?? []
    list.push(line)
    ordersByToken.set(o.customerToken, list)
  }

  const clients: LoyaltyClientRow[] = []

  for (const u of allUsers) {
    const orderLines = (ordersByToken.get(u.token) ?? []).sort((a, b) => b.orderId - a.orderId)
    const codeLines = codesByToken.get(u.token) ?? []
    const earned = orderLines.reduce((s, l) => s + l.points, 0)
    const adj = u.loyaltyAdjustment ?? 0
    const spent = u.loyaltySpent ?? 0
    const balance = Math.max(0, earned + adj - spent)
    const codesPointsCost = codeLines.reduce((s, c) => s + (c.pointsCost || 0), 0)
    const codesUsed = codeLines.filter((c) => c.used).length
    const codesUnused = codeLines.length - codesUsed
    const debitOk = spent === codesPointsCost
    const balanceOk = balance === Math.max(0, earned + adj - spent)

    // N'inclure que clients avec activité fidélité (évite liste vide de bruit)
    if (earned === 0 && adj === 0 && spent === 0 && codeLines.length === 0) continue

    clients.push({
      userId: u.id,
      pseudo: u.pseudo,
      token: u.token,
      nickname: u.nickname,
      earned,
      loyaltyAdjustment: adj,
      loyaltySpent: spent,
      balance,
      codesPointsCost,
      codesCount: codeLines.length,
      codesUsed,
      codesUnused,
      debitOk,
      balanceOk,
      ordersDelivered: orderLines.length,
      orderLines,
      codeLines,
    })
  }

  // Trier : anomalies d'abord, puis solde décroissant
  clients.sort((a, b) => {
    const aBad = a.debitOk ? 0 : 1
    const bBad = b.debitOk ? 0 : 1
    if (aBad !== bBad) return bBad - aBad
    return b.balance - a.balance
  })

  const anomalies = clients.filter((c) => !c.debitOk).length

  return {
    clients,
    allCodes,
    totals: {
      clients: clients.length,
      earned: clients.reduce((s, c) => s + c.earned, 0),
      spent: clients.reduce((s, c) => s + c.loyaltySpent, 0),
      balance: clients.reduce((s, c) => s + c.balance, 0),
      codesTotal: allCodes.length,
      codesUsed: allCodes.filter((c) => c.used).length,
      codesUnused: allCodes.filter((c) => !c.used).length,
      anomalies,
    },
  }
}

/** Répare loyaltySpent = somme des pointsCost des codes (si désync). */
export async function repairLoyaltySpent(userId: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  if (!userId) return { ok: false as const, error: "id manquant" }

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!u) return { ok: false as const, error: "client introuvable" }

  const codes = await db.select().from(loyaltyCodes).where(eq(loyaltyCodes.userToken, u.token))
  const sum = codes.reduce((s, c) => s + (c.pointsCost || 0), 0)

  await db.update(users).set({ loyaltySpent: sum }).where(eq(users.id, userId))

  return {
    ok: true as const,
    previousSpent: u.loyaltySpent,
    newSpent: sum,
    pseudo: u.pseudo,
    tokenHint: shortToken(u.token),
  }
}

/** Recalcule le solde théorique d'un client (debug). */
export async function previewClientLoyalty(token: string) {
  if (!(await isAdminAuthenticated())) return null
  const t = token?.trim()
  if (!t) return null
  const overview = await getLoyaltyOverview()
  return overview.clients.find((c) => c.token === t) ?? null
}
