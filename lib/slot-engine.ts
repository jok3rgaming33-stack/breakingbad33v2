import "server-only"
import { pool } from "@/lib/db"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import { ensureFeatureSchema } from "@/lib/feature-schema"
import {
  calcDeliveryFee,
  DELIVERY_ORIGIN,
  haversineKm,
  matchingFreeDeliveryTier,
} from "@/lib/delivery-fee"
import { PLATINUM_FREE_DELIVERY_MIN } from "@/lib/loyalty"
import { computePromoDiscount } from "@/lib/promo-calc"
import { isRateLimited } from "@/lib/rate-limit"
import type { MachineState, MachineVoucherView, PlayResult, UltimateView } from "@/lib/slot-public"
import type { PoolClient } from "pg"

/** 1 tour / 60€ de produits. Le client ne reçoit jamais cette table. */
const WEIGHT_VERSION = "2026-10-08-v2"
const WEIGHTS: { id: string; w: number }[] = [
  { id: "miss", w: 880 },
  { id: "tuco", w: 40 },
  { id: "badger", w: 36 },
  { id: "crystal", w: 12 },
  { id: "gus", w: 18 },
  { id: "jesse", w: 8 },
  { id: "walter", w: 6 },
]
const SPIN_CENTS = 6000
const SPIN_CAP = 10
const SPIN_DAYS = 7
const VOUCHER_DAYS = 30
const WINDOW_MS = 30 * 86400000
const EVAL_CENTS = 30000
const POINT_LOT = 150
const CRYSTAL_DEPTH_CAP = 5
const PRODUCT_RANK: Record<string, number> = { jesse: 1, walter: 2 }

export type SlotLine = { productId?: number; title: string; qty: number; price: number }

function drawIndex(total: number): number {
  if (total <= 0) return 0
  const limit = Math.floor(0x100000000 / total) * total
  const buf = new Uint32Array(1)
  let r = 0
  do {
    crypto.getRandomValues(buf)
    r = buf[0]
  } while (r >= limit)
  return r % total
}

function drawOutcome(weights: { id: string; w: number }[]): string {
  const total = weights.reduce((s, r) => s + r.w, 0)
  const ticket = drawIndex(total)
  let acc = 0
  for (const row of weights) {
    acc += row.w
    if (ticket < acc) return row.id
  }
  return "miss"
}

const FILLERS = ["walter", "jesse", "gus", "badger", "tuco", "crystal"]

function missStrip(): string[] {
  const a = FILLERS[drawIndex(FILLERS.length)]
  let b = FILLERS[drawIndex(FILLERS.length)]
  while (b === a) b = FILLERS[drawIndex(FILLERS.length)]
  const layouts = [
    [a, a, b],
    [a, b, a],
    [b, a, a],
  ]
  return layouts[drawIndex(layouts.length)]
}

function parisMidnightUtc(now = new Date()): { start: Date; end: Date } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const utcMidnight = new Date(`${day}T00:00:00Z`)
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(utcMidnight),
  )
  const start = new Date(utcMidnight.getTime() - hour * 3600000)
  const nextDay = new Date(utcMidnight.getTime() + 26 * 3600000)
  const nextKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nextDay)
  const nextUtc = new Date(`${nextKey}T00:00:00Z`)
  const nextHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(nextUtc),
  )
  const end = new Date(nextUtc.getTime() - nextHour * 3600000)
  return { start, end }
}

function prizeLabel(outcome: string, prize: Record<string, unknown>): string {
  if (prize.note && typeof prize.note === "string") return prize.note
  switch (outcome) {
    case "walter":
      return "Bon −20€ sur tes produits, dès 60€. Valable 30 jours."
    case "jesse":
      return "Bon −10€ sur tes produits, dès 60€. Valable 30 jours."
    case "gus":
      return "Livraison offerte à utiliser sur une prochaine commande."
    case "badger":
      return "+150 points de fidélité."
    case "crystal":
      return prize.capped ? "150 points — la série de cristaux s'arrête là." : "1 tour supplémentaire, valable 7 jours."
    case "tuco":
      return "Tuco. Le tour est consommé, sans lot."
    default:
      return "Pas de combinaison."
  }
}

function voucherLabel(kind: string): string {
  if (kind === "walter") return "Walter · −20€ produits (dès 60€)"
  if (kind === "jesse") return "Jesse · −10€ produits (dès 60€)"
  if (kind === "gus") return "Gus · livraison offerte"
  return kind
}

function weightsMatch(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length !== WEIGHTS.length) return false
  const byId = new Map(raw.map((row) => [String((row as { id?: string }).id), Number((row as { w?: number }).w)]))
  return WEIGHTS.every((row) => byId.get(row.id) === row.w)
}

async function loadWeights(client: PoolClient): Promise<{ id: string; w: number }[]> {
  const found = await client.query(`SELECT weights FROM slot_weight_sets WHERE version = $1 LIMIT 1`, [
    WEIGHT_VERSION,
  ])
  if (weightsMatch(found.rows[0]?.weights)) return WEIGHTS
  await client.query(
    `INSERT INTO slot_weight_sets (version, weights, signed_note)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (version) DO UPDATE
       SET weights = EXCLUDED.weights, signed_note = EXCLUDED.signed_note`,
    [WEIGHT_VERSION, JSON.stringify(WEIGHTS), "BB33 Albuquerque Luck Spin — table 2026-10-08-v2, serveur uniquement"],
  )
  return WEIGHTS
}

function effectivePrice(price: number, discountType: string | null, discountValue: number | null): number {
  if (discountType === "percent" && discountValue) {
    return Math.max(0, Math.round(price * (1 - discountValue / 100)))
  }
  if (discountType === "fixed" && discountValue) {
    return Math.max(0, price - discountValue)
  }
  return price
}

async function verifyLines(lines: SlotLine[]): Promise<{ euros: number; ok: boolean }> {
  if (!lines.length) return { euros: 0, ok: false }
  const ids = [...new Set(lines.map((l) => l.productId).filter((id): id is number => typeof id === "number" && id > 0))]
  if (!ids.length) return { euros: 0, ok: false }
  const found = await db.select().from(products).where(inArray(products.id, ids))
  const byId = new Map(found.map((p) => [p.id, p]))
  let euros = 0
  for (const line of lines) {
    const qty = Math.trunc(Number(line.qty) || 0)
    const price = Math.trunc(Number(line.price) || 0)
    if (!line.productId || qty <= 0 || qty > 99) return { euros: 0, ok: false }
    const product = byId.get(line.productId)
    if (!product) return { euros: 0, ok: false }
    const allowed = (product.variants ?? []).map((v) =>
      effectivePrice(v.price, product.discountType, product.discountValue),
    )
    if (!allowed.includes(price)) return { euros: 0, ok: false }
    euros += qty * price
  }
  return { euros, ok: true }
}

export async function sumSlotPoints(userToken: string): Promise<number> {
  const t = userToken?.trim()
  if (!t) return 0
  try {
    await ensureFeatureSchema()
    const res = await pool.query(
      `SELECT COALESCE(SUM(points), 0)::int AS s FROM slot_point_entries WHERE user_token = $1 AND test_mode = false`,
      [t],
    )
    return Number(res.rows[0]?.s ?? 0)
  } catch {
    return 0
  }
}

type Quote =
  | {
      ok: true
      discount: number
      convertToPoints: boolean
      label: string
      voucherId: number | null
    }
  | { ok: false; error: string }

export async function quoteMachineVoucher(opts: {
  token: string
  code: string
  subtotal: number
  fulfillment: "livraison" | "meetup" | "locker"
  lat?: number | null
  lng?: number | null
  freeDeliveryActive?: boolean
  deliveryAlreadyFree?: boolean
}): Promise<Quote> {
  await ensureFeatureSchema()
  const token = opts.token?.trim()
  const code = opts.code?.trim().toUpperCase()
  if (!token || !code) return { ok: false, error: "Bon introuvable." }
  const res = await pool.query(
    `SELECT id, kind, amount_eur, status, expires_at, test_mode, user_token
     FROM slot_vouchers WHERE upper(code) = $1 LIMIT 1`,
    [code],
  )
  const v = res.rows[0]
  if (!v || v.test_mode) return { ok: false, error: "Bon introuvable." }
  if (v.user_token !== token) return { ok: false, error: "Ce bon ne t'appartient pas." }
  if (v.status !== "active") return { ok: false, error: "Ce bon n'est plus utilisable." }
  if (v.expires_at && new Date(v.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "Ce bon a expiré." }
  }
  const subtotal = Math.max(0, Math.trunc(opts.subtotal))
  if (v.kind === "walter" || v.kind === "jesse") {
    if (subtotal < 60) return { ok: false, error: "Il faut 60€ de produits pour ce bon." }
    const amount = v.kind === "walter" ? 20 : 10
    return {
      ok: true,
      discount: amount,
      convertToPoints: false,
      label: voucherLabel(v.kind),
      voucherId: v.id,
    }
  }
  if (v.kind === "gus") {
    const lat = opts.lat
    const lng = opts.lng
    const convert =
      !!opts.deliveryAlreadyFree ||
      opts.fulfillment !== "livraison" ||
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    if (convert) {
      return {
        ok: true,
        discount: 0,
        convertToPoints: true,
        label: "Gus · retrait ou adresse absente → 150 points",
        voucherId: v.id,
      }
    }
    const km = haversineKm(DELIVERY_ORIGIN.lat, DELIVERY_ORIGIN.lng, lat, lng)
    const raw = calcDeliveryFee(km)
    const alreadyFree =
      matchingFreeDeliveryTier(subtotal, km) != null ||
      (!!opts.freeDeliveryActive && subtotal >= PLATINUM_FREE_DELIVERY_MIN)
    if (alreadyFree || raw <= 0) {
      return {
        ok: true,
        discount: 0,
        convertToPoints: true,
        label: "Gus · livraison déjà offerte → 150 points",
        voucherId: v.id,
      }
    }
    return {
      ok: true,
      discount: raw,
      convertToPoints: false,
      label: `Gus · livraison offerte (−${raw}€)`,
      voucherId: v.id,
    }
  }
  return { ok: false, error: "Bon inconnu." }
}

export async function prepareSlotSnapshot(opts: {
  token: string | null
  lines: SlotLine[]
  total: number
  promoCode?: string | null
  machineCode?: string | null
  fulfillment: "livraison" | "meetup" | "locker"
  lat?: number | null
  lng?: number | null
  freeDeliveryActive: boolean
  deliveryAlreadyFree?: boolean
}): Promise<
  | {
      ok: true
      productsCents: number | null
      block: string | null
      discount: number
      convertToPoints: boolean
      voucherId: number | null
      note: string | null
    }
  | { ok: false; error: string }
> {
  await ensureFeatureSchema()
  const verified = await verifyLines(opts.lines)
  if (!verified.ok) {
    if (opts.machineCode?.trim()) {
      return { ok: false, error: "Impossible de vérifier le panier pour ce bon." }
    }
    return {
      ok: true,
      productsCents: null,
      block: null,
      discount: 0,
      convertToPoints: false,
      voucherId: null,
      note: null,
    }
  }

  let promoOff = 0
  let block: string | null = null
  const promoCode = opts.promoCode?.trim().toUpperCase() || ""
  const machineCode = opts.machineCode?.trim().toUpperCase() || ""
  if (promoCode && machineCode) {
    return { ok: false, error: "Un bon Albuquerque Luck Spin ne se cumule pas avec un autre code." }
  }
  if (promoCode) {
    const loyalty = await pool.query(
      `SELECT user_token, discount, used, min_amount FROM loyalty_codes WHERE upper(code) = $1 LIMIT 1`,
      [promoCode],
    )
    const l = loyalty.rows[0]
    if (l) {
      if (!opts.token || l.user_token !== opts.token) {
        return { ok: false, error: "Ce code fidélité ne t'appartient pas." }
      }
      if (l.used) return { ok: false, error: "Ce code fidélité a déjà été utilisé." }
      if (verified.euros < Number(l.min_amount || 0)) {
        return { ok: false, error: `Minimum ${l.min_amount}€ d'achat requis.` }
      }
      block = "loyalty"
      promoOff = Math.min(verified.euros, Number(l.discount) || 0)
    } else {
      const promo = await pool.query(
        `SELECT type, value, min_amount, product_name, active FROM promo_codes WHERE upper(code) = $1 LIMIT 1`,
        [promoCode],
      )
      const p = promo.rows[0]
      if (p?.active) {
        promoOff = computePromoDiscount(
          opts.lines.map((l) => ({ title: l.title, qty: l.qty, price: l.price })),
          verified.euros,
          {
            type: p.type,
            value: Number(p.value) || 0,
            minAmount: Number(p.min_amount) || 0,
            productName: p.product_name,
          },
        )
      }
    }
  }

  let discount = 0
  let convertToPoints = false
  let voucherId: number | null = null
  let note: string | null = null
  if (machineCode) {
    if (!opts.token) return { ok: false, error: "Connecte-toi pour utiliser ce bon." }
    const quote = await quoteMachineVoucher({
      token: opts.token,
      code: machineCode,
      subtotal: verified.euros,
      fulfillment: opts.fulfillment,
      lat: opts.lat,
      lng: opts.lng,
      freeDeliveryActive: opts.freeDeliveryActive,
      deliveryAlreadyFree: opts.deliveryAlreadyFree,
    })
    if (!quote.ok) return quote
    if (opts.total < 60 && !quote.convertToPoints && (quote.label.startsWith("Walter") || quote.label.startsWith("Jesse"))) {
      return { ok: false, error: "Il faut 60€ de produits pour ce bon." }
    }
    if (quote.discount > 0 && opts.total < quote.discount) {
      return { ok: false, error: "Le total ne couvre pas ce bon." }
    }
    discount = quote.discount
    convertToPoints = quote.convertToPoints
    voucherId = quote.voucherId
    note = quote.label
    block = "machine"
  }

  const productsEuros = Math.max(0, verified.euros - (block === "machine" ? 0 : promoOff))
  const capped = Math.min(productsEuros, Math.max(0, Math.trunc(opts.total)))
  const productsCents = Math.round(capped * 100)
  return {
    ok: true,
    productsCents,
    block,
    discount,
    convertToPoints,
    voucherId,
    note,
  }
}

export async function commitMachineVoucher(opts: {
  voucherId: number
  orderId: number
  userToken: string
  convertToPoints: boolean
}): Promise<{ ok: boolean }> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const up = await client.query(
      `UPDATE slot_vouchers
       SET status = $1, used_order_id = $2
       WHERE id = $3 AND user_token = $4 AND status = 'active' AND test_mode = false
       RETURNING id`,
      [opts.convertToPoints ? "converted" : "used", opts.orderId, opts.voucherId, opts.userToken],
    )
    if (up.rowCount !== 1) {
      await client.query("ROLLBACK")
      return { ok: false }
    }
    if (opts.convertToPoints) {
      await client.query(
        `INSERT INTO slot_point_entries (user_token, points, reason, source_id, order_id, test_mode)
         VALUES ($1, $2, 'gus_fallback', $3, $4, false)
         ON CONFLICT (source_id) DO NOTHING`,
        [opts.userToken, POINT_LOT, `gus-empty:${opts.voucherId}`, opts.orderId],
      )
    }
    await client.query("COMMIT")
    return { ok: true }
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] commit voucher", e)
    return { ok: false }
  } finally {
    client.release()
  }
}

function spinsForCents(cents: number, blocked: boolean): number {
  if (blocked || cents < SPIN_CENTS) return 0
  return Math.min(SPIN_CAP, Math.floor(cents / SPIN_CENTS))
}

export async function creditSpinsForOrder(orderId: number): Promise<void> {
  if (!orderId) return
  try {
    await ensureFeatureSchema()
  } catch {
    return
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const order = await client.query(
      `SELECT id, customer_token, slot_products_cents, slot_block
       FROM order_threads WHERE id = $1 FOR UPDATE`,
      [orderId],
    )
    const row = order.rows[0]
    if (!row?.customer_token || row.slot_products_cents == null) {
      await client.query("COMMIT")
      return
    }
    const cents = Math.max(0, Number(row.slot_products_cents) || 0)
    const blocked = row.slot_block ? String(row.slot_block) : null
    const spins = spinsForCents(cents, !!blocked)
    const ins = await client.query(
      `INSERT INTO slot_credits (order_id, user_token, products_cents, spins_granted, blocked)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO NOTHING
       RETURNING id`,
      [orderId, row.customer_token, cents, spins, blocked],
    )
    if (ins.rowCount !== 1) {
      await client.query("COMMIT")
      return
    }
    for (let i = 0; i < spins; i++) {
      await client.query(
        `INSERT INTO slot_grants (user_token, source_type, source_id, order_id, cascade_depth, status, expires_at, test_mode)
         VALUES ($1, 'order', $2, $3, 0, 'available', NOW() + make_interval(days => $4::int), false)`,
        [row.customer_token, `order:${orderId}:${i}`, orderId, SPIN_DAYS],
      )
    }
    if (spins > 0) {
      await client.query(
        `UPDATE users SET slot_anchor_at = COALESCE(slot_anchor_at, NOW()) WHERE token = $1`,
        [row.customer_token],
      )
    }
    await client.query("COMMIT")
    console.info("[slot] credit", { orderId, spins, cents, blocked })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] credit failed", orderId, e)
  } finally {
    client.release()
  }
}

export async function syncSlotBase(orderId: number, productsCents: number): Promise<void> {
  const next = Math.max(0, Math.trunc(productsCents))
  const client = await pool.connect()
  try {
    await ensureFeatureSchema()
    await client.query("BEGIN")
    const order = await client.query(
      `SELECT slot_products_cents, slot_block, customer_token FROM order_threads WHERE id = $1 FOR UPDATE`,
      [orderId],
    )
    const row = order.rows[0]
    if (!row || row.slot_products_cents == null || !row.customer_token) {
      await client.query("COMMIT")
      return
    }
    const credit = await client.query(`SELECT id, products_cents, spins_granted FROM slot_credits WHERE order_id = $1 FOR UPDATE`, [
      orderId,
    ])
    if (!credit.rows[0]) {
      await client.query(`UPDATE order_threads SET slot_products_cents = $1 WHERE id = $2`, [next, orderId])
      await client.query("COMMIT")
      return
    }
    const stored = Number(credit.rows[0].products_cents) || 0
    if (next >= stored) {
      await client.query("COMMIT")
      return
    }
    await client.query(`UPDATE order_threads SET slot_products_cents = $1 WHERE id = $2`, [next, orderId])
    await client.query(`UPDATE slot_credits SET products_cents = $1 WHERE order_id = $2`, [next, orderId])
    const target = spinsForCents(next, !!row.slot_block)
    const grants = await client.query(
      `SELECT id, status FROM slot_grants
       WHERE order_id = $1 AND source_type = 'order' AND test_mode = false
       ORDER BY id DESC`,
      [orderId],
    )
    const consumed = grants.rows.filter((g) => g.status === "consumed").length
    let available = grants.rows.filter((g) => g.status === "available")
    const keep = Math.max(0, target - consumed)
    const drop = available.slice(0, Math.max(0, available.length - keep))
    for (const g of drop) {
      await client.query(`UPDATE slot_grants SET status = 'cancelled' WHERE id = $1 AND status = 'available'`, [g.id])
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] sync base", orderId, e)
  } finally {
    client.release()
  }
}

export async function cancelSpinsForOrder(orderId: number): Promise<void> {
  const client = await pool.connect()
  try {
    await ensureFeatureSchema()
    await client.query("BEGIN")
    const grants = await client.query(
      `UPDATE slot_grants SET status = 'cancelled'
       WHERE order_id = $1 AND status = 'available' AND test_mode = false
       RETURNING id`,
      [orderId],
    )
    const ids = grants.rows.map((g) => g.id as number)
    if (ids.length || true) {
      const plays = await client.query(
        `SELECT p.id FROM slot_plays p
         JOIN slot_grants g ON g.id = p.grant_id
         WHERE g.order_id = $1 AND p.test_mode = false`,
        [orderId],
      )
      const playIds = plays.rows.map((p) => p.id as number)
      if (playIds.length) {
        await client.query(
          `UPDATE slot_vouchers SET status = 'invalidated'
           WHERE play_id = ANY($1::int[]) AND status = 'active' AND test_mode = false`,
          [playIds],
        )
        const points = await client.query(
          `SELECT id, user_token, points, source_id FROM slot_point_entries
           WHERE play_id = ANY($1::int[]) AND points > 0 AND test_mode = false`,
          [playIds],
        )
        for (const entry of points.rows) {
          await client.query(
            `INSERT INTO slot_point_entries (user_token, points, reason, source_id, play_id, order_id, test_mode)
             VALUES ($1, $2, 'reversal', $3, $4, $5, false)
             ON CONFLICT (source_id) DO NOTHING`,
            [entry.user_token, -Number(entry.points), `reversal:${entry.id}`, null, orderId],
          )
        }
      }
    }
    await client.query("COMMIT")
    console.info("[slot] cancel", { orderId, cancelled: ids.length })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] cancel", orderId, e)
  } finally {
    client.release()
  }
}

async function applyDailyCap(client: PoolClient, userToken: string, outcome: string): Promise<string> {
  if (outcome !== "walter" && outcome !== "jesse") return outcome
  const { start, end } = parisMidnightUtc()
  const count = await client.query(
    `SELECT COUNT(*)::int AS n FROM slot_plays
     WHERE user_token = $1 AND outcome = $2 AND test_mode = false
       AND created_at >= $3 AND created_at < $4`,
    [userToken, outcome, start.toISOString(), end.toISOString()],
  )
  const n = Number(count.rows[0]?.n ?? 0)
  const max = outcome === "walter" ? 1 : 2
  if (n >= max) return "badger"
  return outcome
}

async function award(
  client: PoolClient,
  opts: {
    userToken: string
    playId: number
    grantId: number
    orderId: number | null
    depth: number
    outcome: string
  },
): Promise<Record<string, unknown>> {
  const { userToken, playId, outcome, depth, orderId, grantId } = opts
  if (outcome === "miss" || outcome === "tuco") return {}
  if (outcome === "badger") {
    await client.query(
      `INSERT INTO slot_point_entries (user_token, points, reason, source_id, play_id, order_id, test_mode)
       VALUES ($1, $2, 'badger', $3, $4, $5, false)
       ON CONFLICT (source_id) DO NOTHING`,
      [userToken, POINT_LOT, `badger:${playId}`, playId, orderId],
    )
    return {}
  }
  if (outcome === "crystal") {
    if (depth >= CRYSTAL_DEPTH_CAP) {
      await client.query(
        `INSERT INTO slot_point_entries (user_token, points, reason, source_id, play_id, order_id, test_mode)
         VALUES ($1, $2, 'crystal_cap', $3, $4, $5, false)
         ON CONFLICT (source_id) DO NOTHING`,
        [userToken, POINT_LOT, `crystal-cap:${playId}`, playId, orderId],
      )
      return { capped: true, note: "150 points — la série de cristaux s'arrête là." }
    }
    await client.query(
      `INSERT INTO slot_grants (user_token, source_type, source_id, order_id, parent_grant_id, cascade_depth, status, expires_at, test_mode)
       VALUES ($1, 'crystal', $2, $3, $4, $5, 'available', NOW() + make_interval(days => $6::int), false)
       ON CONFLICT (source_type, source_id) DO NOTHING`,
      [userToken, `crystal:${playId}`, orderId, grantId, depth + 1, SPIN_DAYS],
    )
    return {}
  }
  if (outcome === "walter" || outcome === "jesse") {
    const existing = await client.query(
      `SELECT id, kind FROM slot_vouchers
       WHERE user_token = $1 AND status = 'active' AND test_mode = false
         AND kind IN ('walter', 'jesse')
         AND (expires_at IS NULL OR expires_at > NOW())
       FOR UPDATE`,
      [userToken],
    )
    const current = existing.rows[0]
    const nextRank = PRODUCT_RANK[outcome] ?? 0
    const curRank = current ? PRODUCT_RANK[String(current.kind)] ?? 0 : 0
    if (current && curRank >= nextRank) {
      return {
        note:
          current.kind === "walter"
            ? "Tu gardes ton bon −20€ déjà actif."
            : "Tu gardes ton bon −10€ déjà actif.",
      }
    }
    if (current) {
      await client.query(`UPDATE slot_vouchers SET status = 'invalidated' WHERE id = $1`, [current.id])
    }
    const code = makeCode()
    const amount = outcome === "walter" ? 20 : 10
    await client.query(
      `INSERT INTO slot_vouchers (user_token, code, kind, amount_eur, status, play_id, expires_at, test_mode)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW() + make_interval(days => $6::int), false)`,
      [userToken, code, outcome, amount, playId, VOUCHER_DAYS],
    )
    return { code }
  }
  if (outcome === "gus") {
    const existing = await client.query(
      `SELECT id FROM slot_vouchers
       WHERE user_token = $1 AND status = 'active' AND test_mode = false AND kind = 'gus'
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [userToken],
    )
    if (existing.rows[0]) {
      return { note: "Tu as déjà une livraison offerte en attente." }
    }
    const code = makeCode()
    await client.query(
      `INSERT INTO slot_vouchers (user_token, code, kind, amount_eur, status, play_id, expires_at, test_mode)
       VALUES ($1, $2, 'gus', NULL, 'active', $3, NOW() + make_interval(days => $4::int), false)`,
      [userToken, code, playId, VOUCHER_DAYS],
    )
    return { code }
  }
  return {}
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let s = "MC-"
  for (const b of bytes) s += alphabet[b % alphabet.length]
  return s
}

async function countAvailable(client: PoolClient, userToken: string): Promise<number> {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n FROM slot_grants
     WHERE user_token = $1 AND status = 'available' AND expires_at > NOW() AND test_mode = false`,
    [userToken],
  )
  return Number(res.rows[0]?.n ?? 0)
}

export async function playSpin(userToken: string): Promise<PlayResult> {
  const token = userToken?.trim()
  if (!token) return { ok: false, error: "Connecte-toi pour tirer." }
  if (isRateLimited(`slot:${token}`, 1, 2000)) {
    return { ok: false, error: "Patiente deux secondes entre deux tours." }
  }
  await ensureFeatureSchema()
  const user = await pool.query(`SELECT id FROM users WHERE token = $1 LIMIT 1`, [token])
  if (!user.rows[0]) return { ok: false, error: "Compte introuvable." }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `UPDATE slot_grants SET status = 'expired'
       WHERE user_token = $1 AND status = 'available' AND expires_at <= NOW() AND test_mode = false`,
      [token],
    )
    const locked = await client.query(
      `SELECT id, cascade_depth, order_id FROM slot_grants
       WHERE user_token = $1 AND status = 'available' AND expires_at > NOW() AND test_mode = false
       ORDER BY expires_at ASC, id ASC
       LIMIT 1
       FOR UPDATE`,
      [token],
    )
    const grant = locked.rows[0]
    if (!grant) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Aucun tirage disponible." }
    }
    const weights = await loadWeights(client)
    let outcome = drawOutcome(weights)
    outcome = await applyDailyCap(client, token, outcome)
    const symbols = outcome === "miss" ? missStrip() : [outcome, outcome, outcome]
    const inserted = await client.query(
      `INSERT INTO slot_plays (grant_id, user_token, outcome, symbols, prize, test_mode)
       VALUES ($1, $2, $3, $4::jsonb, '{}'::jsonb, false)
       RETURNING id`,
      [grant.id, token, outcome, JSON.stringify(symbols)],
    )
    const playId = inserted.rows[0].id as number
    await client.query(`UPDATE slot_grants SET status = 'consumed' WHERE id = $1`, [grant.id])
    const prize = await award(client, {
      userToken: token,
      playId,
      grantId: grant.id,
      orderId: grant.order_id ?? null,
      depth: Number(grant.cascade_depth) || 0,
      outcome,
    })
    await client.query(`UPDATE slot_plays SET prize = $1::jsonb WHERE id = $2`, [JSON.stringify(prize), playId])
    const available = await countAvailable(client, token)
    await client.query("COMMIT")
    console.info("[slot] play", { user: token.slice(0, 6), orderId: grant.order_id, outcome, playId })
    return { ok: true, symbols, outcome, label: prizeLabel(outcome, prize), available }
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] play", e)
    return { ok: false, error: "Le tirage n'a pas abouti. Ton tour n'a pas été consommé." }
  } finally {
    client.release()
  }
}

export async function playAdminTrial(): Promise<PlayResult> {
  await ensureFeatureSchema()
  if (isRateLimited("slot:admin-test", 1, 2000)) {
    return { ok: false, error: "Patiente deux secondes entre deux essais." }
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const weights = await loadWeights(client)
    const outcome = drawOutcome(weights)
    const symbols = outcome === "miss" ? missStrip() : [outcome, outcome, outcome]
    const sourceId = `admin:${crypto.randomUUID()}`
    const grant = await client.query(
      `INSERT INTO slot_grants (user_token, source_type, source_id, cascade_depth, status, expires_at, test_mode)
       VALUES ('admin-test', 'admin_test', $1, 0, 'consumed', NOW() + interval '1 hour', true)
       RETURNING id`,
      [sourceId],
    )
    const prize = { trial: true, note: `Essai admin — aucun gain réel. Résultat : ${outcome}.` }
    await client.query(
      `INSERT INTO slot_plays (grant_id, user_token, outcome, symbols, prize, test_mode)
       VALUES ($1, 'admin-test', $2, $3::jsonb, $4::jsonb, true)`,
      [grant.rows[0].id, outcome, JSON.stringify(symbols), JSON.stringify(prize)],
    )
    await client.query("COMMIT")
    const label = `Essai — ${prizeLabel(outcome, {})} Rien n'est crédité.`
    return { ok: true, symbols, outcome, label, available: 0, trial: true }
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] admin trial", e)
    return { ok: false, error: "Essai impossible." }
  } finally {
    client.release()
  }
}

async function qualifyingSpend(client: PoolClient, token: string): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(COALESCE(total, 0) + COALESCE(loyalty_discount, 0)), 0)::int AS s
     FROM order_threads WHERE customer_token = $1 AND status = 'livree'`,
    [token],
  )
  return Number(res.rows[0]?.s ?? 0)
}

async function evalSpend(client: PoolClient, token: string, from: Date, to: Date): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(products_cents), 0)::int AS s FROM slot_credits
     WHERE user_token = $1 AND created_at >= $2 AND created_at < $3`,
    [token, from.toISOString(), to.toISOString()],
  )
  return Number(res.rows[0]?.s ?? 0)
}

type UserSlot = {
  id: number
  pseudo: string
  peak_tier: string
  slot_anchor_at: Date | null
  slot_cycle: number
  slot_claims: number
  slot_claim3_at: Date | null
  slot_free_stopped: boolean
}

function ultimateHint(u: UserSlot, isUltimate: boolean, evalEuros: number | null): UltimateView {
  const base: UltimateView = {
    stopped: !!u.slot_free_stopped,
    anchorAt: u.slot_anchor_at ? new Date(u.slot_anchor_at).toISOString() : null,
    canClaim: false,
    claimHint: "",
    claimsUsed: Number(u.slot_claims) || 0,
    evalEuros,
    evalNeed: null,
  }
  if (!isUltimate) {
    base.claimHint = "Le palier Ultimate (1 200 pts de statut) ouvre les tours gratuits."
    return base
  }
  if (u.slot_free_stopped) {
    base.claimHint = "Le droit aux tours gratuits est terminé."
    return base
  }
  if (!u.slot_anchor_at) {
    base.claimHint =
      "Le compteur démarre à ta première commande qui crédite un tour payant. Les anciennes commandes ne comptent pas."
    return base
  }
  const anchor = new Date(u.slot_anchor_at).getTime()
  const now = Date.now()
  const windowIndex = Math.floor((now - anchor) / WINDOW_MS)
  const claims = Number(u.slot_claims) || 0
  if (claims >= 3 && u.slot_claim3_at) {
    const start = new Date(u.slot_claim3_at).getTime()
    const end = start + WINDOW_MS
    const euros = evalEuros ?? 0
    base.evalEuros = euros
    base.evalNeed = 300
    if (now < end && euros < 300) {
      base.claimHint = `Contrôle en cours : ${euros}€ / 300€ de produits avant le ${new Date(end).toLocaleDateString("fr-FR")}.`
      return base
    }
    if (euros >= 300) {
      base.canClaim = true
      base.claimHint = "300€ de produits atteints. Tu peux ouvrir un nouveau cycle."
      return base
    }
    base.stopped = true
    base.claimHint = "Les 300€ n'ont pas été atteints. Le droit aux tours gratuits s'arrête."
    return base
  }
  if (windowIndex >= 3) {
    base.stopped = true
    base.claimHint = "Le cycle est terminé sans les trois tours. Le droit s'arrête."
    return base
  }
  const windowEnd = new Date(anchor + (windowIndex + 1) * WINDOW_MS)
  base.canClaim = true
  base.claimHint = `Un tour gratuit est à réclamer avant le ${windowEnd.toLocaleDateString("fr-FR")}. Fenêtre ${windowIndex + 1}/3.`
  return base
}

export async function getMachineState(userToken: string | null): Promise<MachineState> {
  const empty: MachineState = {
    loggedIn: false,
    pseudo: null,
    tierLabel: null,
    tierEmoji: null,
    isUltimate: false,
    available: 0,
    soonestExpiry: null,
    last: null,
    vouchers: [],
    ultimate: null,
  }
  const token = userToken?.trim()
  if (!token) return empty
  try {
    await ensureFeatureSchema()
  } catch {
    return empty
  }
  const user = await pool.query(
    `SELECT id, pseudo, peak_tier, slot_anchor_at, slot_cycle, slot_claims, slot_claim3_at, slot_free_stopped
     FROM users WHERE token = $1 LIMIT 1`,
    [token],
  )
  const u = user.rows[0] as UserSlot | undefined
  if (!u) return empty
  const client = await pool.connect()
  try {
    const spent = await qualifyingSpend(client, token)
    const ultimateFlag = u.peak_tier === "ultimate" || spent >= 1200
    let evalEuros: number | null = null
    if (u.slot_claim3_at) {
      const from = new Date(u.slot_claim3_at)
      const cents = await evalSpend(client, token, from, new Date(from.getTime() + WINDOW_MS))
      evalEuros = Math.floor(cents / 100)
    }
    const available = await client.query(
      `SELECT COUNT(*)::int AS n, MIN(expires_at) AS soon
       FROM slot_grants
       WHERE user_token = $1 AND status = 'available' AND expires_at > NOW() AND test_mode = false`,
      [token],
    )
    const last = await client.query(
      `SELECT symbols, outcome, prize, created_at FROM slot_plays
       WHERE user_token = $1 AND test_mode = false
       ORDER BY id DESC LIMIT 1`,
      [token],
    )
    const vouchers = await client.query(
      `SELECT code, kind, expires_at FROM slot_vouchers
       WHERE user_token = $1 AND status = 'active' AND test_mode = false
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC`,
      [token],
    )
    const lastRow = last.rows[0]
    const { getTierById } = await import("@/lib/loyalty")
    const tier = getTierById(ultimateFlag ? "ultimate" : u.peak_tier)
    const ultimate = ultimateHint(u, ultimateFlag, evalEuros)
    if (ultimate.canClaim && u.slot_anchor_at && (Number(u.slot_claims) || 0) < 3) {
      const windowIndex = Math.floor((Date.now() - new Date(u.slot_anchor_at).getTime()) / WINDOW_MS)
      const claimed = await client.query(
        `SELECT id FROM slot_free_claims WHERE user_token = $1 AND cycle_index = $2 AND window_index = $3`,
        [token, Number(u.slot_cycle) || 0, windowIndex],
      )
      if (claimed.rows[0]) {
        ultimate.canClaim = false
        ultimate.claimHint = "Déjà réclamé pour cette période."
      }
    }
    return {
      loggedIn: true,
      pseudo: u.pseudo,
      tierLabel: tier.label,
      tierEmoji: tier.emoji,
      isUltimate: ultimateFlag,
      available: Number(available.rows[0]?.n ?? 0),
      soonestExpiry: available.rows[0]?.soon ? new Date(available.rows[0].soon).toISOString() : null,
      last: lastRow
        ? {
            symbols: lastRow.symbols as string[],
            outcome: String(lastRow.outcome),
            label: prizeLabel(String(lastRow.outcome), (lastRow.prize ?? {}) as Record<string, unknown>),
            at: new Date(lastRow.created_at).toISOString(),
          }
        : null,
      vouchers: vouchers.rows.map((v) => ({
        code: String(v.code),
        kind: String(v.kind),
        label: voucherLabel(String(v.kind)),
        expiresAt: v.expires_at ? new Date(v.expires_at).toISOString() : null,
      })),
      ultimate,
    }
  } finally {
    client.release()
  }
}

export async function claimUltimateSpin(userToken: string): Promise<{ ok: true; hint: string } | { ok: false; error: string }> {
  const token = userToken?.trim()
  if (!token) return { ok: false, error: "Connecte-toi." }
  if (isRateLimited(`slot-claim:${token}`, 1, 2000)) {
    return { ok: false, error: "Patiente deux secondes." }
  }
  await ensureFeatureSchema()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const locked = await client.query(
      `SELECT id, pseudo, peak_tier, slot_anchor_at, slot_cycle, slot_claims, slot_claim3_at, slot_free_stopped
       FROM users WHERE token = $1 FOR UPDATE`,
      [token],
    )
    const u = locked.rows[0] as UserSlot | undefined
    if (!u) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Compte introuvable." }
    }
    const spent = await qualifyingSpend(client, token)
    const ultimate = u.peak_tier === "ultimate" || spent >= 1200
    if (!ultimate) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Réservé au palier Ultimate." }
    }
    if (u.slot_free_stopped) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Le droit aux tours gratuits est terminé." }
    }
    if (!u.slot_anchor_at) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Le compteur n'a pas encore démarré." }
    }

    let anchor = new Date(u.slot_anchor_at)
    let cycle = Number(u.slot_cycle) || 0
    let claims = Number(u.slot_claims) || 0
    let claim3 = u.slot_claim3_at ? new Date(u.slot_claim3_at) : null

    if (claims >= 3 && claim3) {
      const end = new Date(claim3.getTime() + WINDOW_MS)
      const cents = await evalSpend(client, token, claim3, end)
      if (cents < EVAL_CENTS) {
        if (Date.now() >= end.getTime()) {
          await client.query(`UPDATE users SET slot_free_stopped = true WHERE id = $1`, [u.id])
          await client.query("COMMIT")
          return { ok: false, error: "Les 300€ n'ont pas été atteints. Le droit s'arrête." }
        }
        await client.query("ROLLBACK")
        return {
          ok: false,
          error: `Contrôle en cours : ${Math.floor(cents / 100)}€ / 300€ de produits.`,
        }
      }
      anchor = new Date()
      cycle += 1
      claims = 0
      claim3 = null
      await client.query(
        `UPDATE users SET slot_anchor_at = $1, slot_cycle = $2, slot_claims = 0, slot_claim3_at = NULL WHERE id = $3`,
        [anchor.toISOString(), cycle, u.id],
      )
    }

    const windowIndex = Math.floor((Date.now() - anchor.getTime()) / WINDOW_MS)
    if (windowIndex >= 3 || windowIndex < 0) {
      await client.query(`UPDATE users SET slot_free_stopped = true WHERE id = $1`, [u.id])
      await client.query("COMMIT")
      return { ok: false, error: "Le cycle est terminé." }
    }
    if (claims >= 3) {
      await client.query("ROLLBACK")
      return { ok: false, error: "Les trois tours de ce cycle sont déjà pris." }
    }

    const sourceId = `ultimate:${u.id}:${cycle}:${windowIndex}`
    const existing = await client.query(
      `SELECT id FROM slot_free_claims WHERE user_token = $1 AND cycle_index = $2 AND window_index = $3`,
      [token, cycle, windowIndex],
    )
    if (existing.rows[0]) {
      await client.query("COMMIT")
      return { ok: true, hint: "Ce tour gratuit est déjà sur ton compte." }
    }
    const grant = await client.query(
      `INSERT INTO slot_grants (user_token, source_type, source_id, cascade_depth, status, expires_at, test_mode)
       VALUES ($1, 'ultimate_claim', $2, 0, 'available', NOW() + make_interval(days => $3::int), false)
       ON CONFLICT (source_type, source_id) DO NOTHING
       RETURNING id`,
      [token, sourceId, SPIN_DAYS],
    )
    const grantId = grant.rows[0]?.id as number | undefined
    if (!grantId) {
      await client.query("COMMIT")
      return { ok: true, hint: "Ce tour gratuit est déjà sur ton compte." }
    }
    await client.query(
      `INSERT INTO slot_free_claims (user_token, cycle_index, window_index, grant_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_token, cycle_index, window_index) DO NOTHING`,
      [token, cycle, windowIndex, grantId],
    )
    const nextClaims = claims + 1
    await client.query(
      `UPDATE users SET slot_claims = $1, slot_claim3_at = CASE WHEN $1 = 3 THEN NOW() ELSE slot_claim3_at END WHERE id = $2`,
      [nextClaims, u.id],
    )
    await client.query("COMMIT")
    return { ok: true, hint: "Tour gratuit ajouté. Il expire dans 7 jours." }
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot] claim", e)
    return { ok: false, error: "Réclamation impossible." }
  } finally {
    client.release()
  }
}

export async function listActiveVouchers(userToken: string): Promise<MachineVoucherView[]> {
  const state = await getMachineState(userToken)
  return state.vouchers
}
