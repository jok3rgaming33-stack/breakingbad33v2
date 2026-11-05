"use server"

import { db, pool } from "@/lib/db"
import { loyaltyCodes, orderThreads, slotVouchers, users } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { replayLoyaltyOrders, spendableLoyaltyPoints } from "@/lib/loyalty"
import { normalizeStatus } from "@/lib/order-status"
import { desc, eq, inArray } from "drizzle-orm"

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

export type WheelStockLine = {
  id: number
  code: string
  kind: string
  label: string
  expiresAt: string | null
}

function wheelPrizeLabel(kind: string): string {
  if (kind === "walter") return "Walter · -20€ produits (dès 60€)"
  if (kind === "jesse") return "Jesse · -10€ produits (dès 60€)"
  if (kind === "gus") return "Gus · livraison offerte"
  return kind
}

function voucherInStock(status: string, expiresAt: Date | string | null): boolean {
  if (status !== "active") return false
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() > Date.now()
}

export type LoyaltyClientRow = {
  userId: number
  pseudo: string
  token: string
  nickname: string | null
  /** Points des commandes livrées, avec le multiplicateur de palier */
  earned: number
  /** Points machine inclus dans le solde client */
  machinePoints: number
  loyaltyAdjustment: number
  loyaltySpent: number
  /** Solde affiché à la connexion et dans l'espace fidélité */
  balance: number
  /** Somme des pointsCost des codes générés */
  codesPointsCost: number
  codesCount: number
  codesUsed: number
  codesUnused: number
  /** Bons roue encore utilisables (hors test, non expirés) */
  wheelStock: WheelStockLine[]
  /** true si loyaltySpent couvre au moins la somme des codes (le surplus = livraisons 150 pts) */
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
    /** Codes PF non utilisés + bons roue encore valides */
    stock: number
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
 * - reductions encore en stock (codes PF non utilisés + bons roue actifs)
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
        stock: 0,
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
      peakTier: users.peakTier,
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
            loyaltyDiscount: orderThreads.loyaltyDiscount,
            loyaltyPointsAwarded: orderThreads.loyaltyPointsAwarded,
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

  const rawByToken = new Map<string, typeof orders>()
  for (const o of orders) {
    if (!o.customerToken || normalizeStatus(o.status) !== "livree") continue
    const list = rawByToken.get(o.customerToken) ?? []
    list.push(o)
    rawByToken.set(o.customerToken, list)
  }

  let machineByToken = new Map<string, number>()
  try {
    const machine = await pool.query(
      `SELECT user_token, COALESCE(SUM(points), 0)::int AS s
       FROM slot_point_entries WHERE test_mode = false GROUP BY user_token`,
    )
    machineByToken = new Map(machine.rows.map((row) => [String(row.user_token), Number(row.s ?? 0)]))
  } catch (e) {
    console.error("[loyalty-admin] machine points:", e)
  }

  const wheelByToken = new Map<string, WheelStockLine[]>()
  try {
    const vouchers = await db
      .select({
        id: slotVouchers.id,
        userToken: slotVouchers.userToken,
        code: slotVouchers.code,
        kind: slotVouchers.kind,
        status: slotVouchers.status,
        expiresAt: slotVouchers.expiresAt,
      })
      .from(slotVouchers)
      .where(eq(slotVouchers.testMode, false))
    for (const v of vouchers) {
      if (!voucherInStock(v.status, v.expiresAt)) continue
      const line: WheelStockLine = {
        id: v.id,
        code: v.code,
        kind: v.kind,
        label: wheelPrizeLabel(v.kind),
        expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      }
      const list = wheelByToken.get(v.userToken) ?? []
      list.push(line)
      wheelByToken.set(v.userToken, list)
    }
  } catch (e) {
    console.error("[loyalty-admin] vouchers:", e)
  }

  const clients: LoyaltyClientRow[] = []

  for (const u of allUsers) {
    const raw = rawByToken.get(u.token) ?? []
    const replay = replayLoyaltyOrders(
      raw.map((o) => ({
        id: o.id,
        total: o.total,
        loyaltyDiscount: o.loyaltyDiscount,
        loyaltyPointsAwarded: o.loyaltyPointsAwarded,
      })),
      u.peakTier,
    )
    const pointsById = new Map(replay.perOrder.map((p) => [p.id, p.points]))
    const orderLines = raw
      .map((o) => ({
        orderId: o.id,
        total: o.total ?? 0,
        points: pointsById.get(o.id) ?? 0,
        status: o.status,
        fulfillment: o.fulfillment,
        deliveredAt: o.updatedAt,
        summary: o.summary,
      }))
      .filter((l) => l.points > 0 || l.total > 0)
      .sort((a, b) => b.orderId - a.orderId)
    const codeLines = codesByToken.get(u.token) ?? []
    const earned = replay.points
    const machinePoints = machineByToken.get(u.token) ?? 0
    const adj = u.loyaltyAdjustment ?? 0
    const spent = u.loyaltySpent ?? 0
    const balance = spendableLoyaltyPoints({
      replayPoints: earned,
      adjustment: adj,
      spent,
      machinePoints,
    })
    const codesPointsCost = codeLines.reduce((s, c) => s + (c.pointsCost || 0), 0)
    const codesUsed = codeLines.filter((c) => c.used).length
    const codesUnused = codeLines.length - codesUsed
    const wheelStock = wheelByToken.get(u.token) ?? []
    const debitOk = spent >= codesPointsCost
    const balanceOk = balance === spendableLoyaltyPoints({
      replayPoints: earned,
      adjustment: adj,
      spent,
      machinePoints,
    })

    // N'inclure que clients avec activité fidélité (évite liste vide de bruit)
    if (
      earned === 0 &&
      machinePoints === 0 &&
      adj === 0 &&
      spent === 0 &&
      codeLines.length === 0 &&
      wheelStock.length === 0
    ) {
      continue
    }

    clients.push({
      userId: u.id,
      pseudo: u.pseudo,
      token: u.token,
      nickname: u.nickname,
      earned,
      machinePoints,
      loyaltyAdjustment: adj,
      loyaltySpent: spent,
      balance,
      codesPointsCost,
      codesCount: codeLines.length,
      codesUsed,
      codesUnused,
      wheelStock,
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
      stock: clients.reduce((s, c) => s + c.codesUnused + c.wheelStock.length, 0),
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
  const spent = u.loyaltySpent ?? 0
  if (spent >= sum) {
    return {
      ok: false as const,
      error: "Rien à réparer : les codes sont déjà couverts. Le surplus vient des livraisons à 150 pts.",
    }
  }

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
