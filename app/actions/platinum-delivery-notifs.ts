"use server"

import { db } from "@/lib/db"
import { users, orderThreads, threadMessages } from "@/lib/db/schema"
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm"
import { notifyCustomer } from "@/lib/push"
import { clientThreadUrl } from "@/lib/deep-links"
import { ensureFeatureSchema } from "@/lib/feature-schema"
import { PLATINUM_FREE_DELIVERY_MIN, PLATINUM_FREE_DELIVERY_POINTS_COST } from "@/lib/loyalty"

async function ensureNotifColumns() {
  await ensureFeatureSchema()
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS free_delivery_start_notified_at TIMESTAMPTZ
    `)
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS free_delivery_ending_notified_at TIMESTAMPTZ
    `)
  } catch (e) {
    console.error("[platinum-notifs] ensure columns:", e)
  }
}

/** Trouve ou crée un fil discussion vendeur ↔ client. */
async function ensureDiscussionThread(token: string, pseudo: string): Promise<number | null> {
  const existing = await db
    .select({ id: orderThreads.id })
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.customerToken, token),
        sql`${orderThreads.status} IN ('discussion', 'pris_en_charge', 'ouvert')`,
      ),
    )
    .limit(1)

  if (existing[0]?.id) return existing[0].id

  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: pseudo || "Client",
      customerToken: token,
      trackingToken: `MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
      summary: "Espace fidélité — Platine",
      total: 0,
      fulfillment: "livraison",
      status: "discussion",
    })
    .returning({ id: orderThreads.id })

  return thread?.id ?? null
}

async function sendVendorMessageAndPush(opts: {
  token: string
  pseudo: string
  body: string
  pushTitle: string
  pushBody: string
  tag: string
}) {
  const threadId = await ensureDiscussionThread(opts.token, opts.pseudo)
  if (!threadId) return false

  await db.insert(threadMessages).values({
    threadId,
    sender: "vendeur",
    body: opts.body,
  })

  try {
    await notifyCustomer(opts.token, {
      title: opts.pushTitle,
      body: opts.pushBody,
      url: clientThreadUrl("messaging", threadId),
      tag: opts.tag,
      threadId,
      open: "messaging",
    })
  } catch (e) {
    console.error("[platinum-notifs] push:", e)
  }

  return true
}

function startMessageBody(until: Date): string {
  const dateStr = until.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  return [
    `💎 Platine — livraison offerte`,
    ``,
    `Ta fenêtre Platine de livraison offerte est active.`,
    `Pendant 30 jours, la livraison est offerte sur tes commandes ≥ ${PLATINUM_FREE_DELIVERY_MIN}€.`,
    ``,
    `Fin de la fenêtre : ${dateStr}.`,
    ``,
    `Tu peux suivre le temps restant dans ton Espace fidélité.`,
    ``,
    `Hors fenêtre, tu pourras toujours offrir la livraison contre ${PLATINUM_FREE_DELIVERY_POINTS_COST} points par commande.`,
    ``,
    `L'équipe BreakingBad33`,
  ].join("\n")
}

function endingMessageBody(until: Date): string {
  const dateStr = until.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  return [
    `⏰ Platine — ta fenêtre livraison offerte se termine bientôt`,
    ``,
    `Il te reste environ 7 jours de livraison offerte (commandes ≥ ${PLATINUM_FREE_DELIVERY_MIN}€).`,
    `Échéance : ${dateStr}.`,
    ``,
    `Après cette date, tu pourras toujours rendre la livraison gratuite en dépensant ${PLATINUM_FREE_DELIVERY_POINTS_COST} points à chaque commande (si ton solde le permet).`,
    ``,
    `Consulte le timer dans ton Espace fidélité.`,
    ``,
    `L'équipe BreakingBad33`,
  ].join("\n")
}

/**
 * Notifie le client que sa fenêtre Platine vient de démarrer.
 * Idempotent via free_delivery_start_notified_at.
 */
export async function notifyPlatinumFreeDeliveryStarted(userId: number): Promise<boolean> {
  await ensureNotifColumns()

  const rows = await db.execute(sql`
    SELECT id, token, pseudo, free_delivery_until, free_delivery_start_notified_at
    FROM users WHERE id = ${userId} LIMIT 1
  `)
  const u = ((rows as { rows?: Record<string, unknown>[] }).rows ?? [])[0] as
    | {
        id: number
        token: string
        pseudo: string
        free_delivery_until: Date | string | null
        free_delivery_start_notified_at: Date | string | null
      }
    | undefined

  if (!u?.token || !u.free_delivery_until) return false
  if (u.free_delivery_start_notified_at) return false

  const until = new Date(u.free_delivery_until)
  if (until.getTime() <= Date.now()) return false

  const ok = await sendVendorMessageAndPush({
    token: u.token,
    pseudo: u.pseudo,
    body: startMessageBody(until),
    pushTitle: "💎 Livraison offerte Platine",
    pushBody: `Ta fenêtre de 30 jours est lancée — commandes ≥ ${PLATINUM_FREE_DELIVERY_MIN}€.`,
    tag: `platinum-free-start-${u.id}`,
  })

  if (ok) {
    await db.execute(sql`
      UPDATE users SET free_delivery_start_notified_at = NOW() WHERE id = ${u.id}
    `)
  }
  return ok
}

/**
 * Rappel J-7 avant la fin de la fenêtre.
 * Idempotent via free_delivery_ending_notified_at.
 */
export async function notifyPlatinumFreeDeliveryEnding(userId: number): Promise<boolean> {
  await ensureNotifColumns()

  const rows = await db.execute(sql`
    SELECT id, token, pseudo, free_delivery_until, free_delivery_ending_notified_at
    FROM users WHERE id = ${userId} LIMIT 1
  `)
  const u = ((rows as { rows?: Record<string, unknown>[] }).rows ?? [])[0] as
    | {
        id: number
        token: string
        pseudo: string
        free_delivery_until: Date | string | null
        free_delivery_ending_notified_at: Date | string | null
      }
    | undefined

  if (!u?.token || !u.free_delivery_until) return false
  if (u.free_delivery_ending_notified_at) return false

  const until = new Date(u.free_delivery_until)
  const msLeft = until.getTime() - Date.now()
  // Fenêtre J-7 : entre 0 et 7.5 jours restants
  if (msLeft <= 0 || msLeft > 7.5 * 86400000) return false

  const ok = await sendVendorMessageAndPush({
    token: u.token,
    pseudo: u.pseudo,
    body: endingMessageBody(until),
    pushTitle: "⏰ Platine — 7 jours restants",
    pushBody: `Ta livraison offerte se termine bientôt (${until.toLocaleDateString("fr-FR")}).`,
    tag: `platinum-free-ending-${u.id}`,
  })

  if (ok) {
    await db.execute(sql`
      UPDATE users SET free_delivery_ending_notified_at = NOW() WHERE id = ${u.id}
    `)
  }
  return ok
}

/**
 * Après avoir posé free_delivery_until sur un user : envoie le message de démarrage.
 */
export async function onPlatinumFreeMonthGranted(userId: number): Promise<void> {
  try {
    await notifyPlatinumFreeDeliveryStarted(userId)
  } catch (e) {
    console.error("[platinum-notifs] start grant:", e)
  }
}

/**
 * Cron / backfill :
 * - envoie le message de démarrage aux platines actifs pas encore notifiés
 * - envoie le rappel J-7 aux concernés
 */
export async function processPlatinumFreeDeliveryNotifs(): Promise<{
  startSent: number
  endingSent: number
}> {
  await ensureNotifColumns()

  let startSent = 0
  let endingSent = 0

  const parseIds = (raw: unknown): number[] => {
    const rows =
      (raw as { rows?: { id: number }[] })?.rows ??
      (Array.isArray(raw) ? (raw as { id: number }[]) : [])
    return rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0)
  }

  // Démarrage : fenêtre encore active, pas encore notifié
  try {
    const starters = await db.execute(sql`
      SELECT id FROM users
      WHERE free_delivery_until IS NOT NULL
        AND free_delivery_until > NOW()
        AND free_delivery_start_notified_at IS NULL
      LIMIT 100
    `)
    for (const id of parseIds(starters)) {
      if (await notifyPlatinumFreeDeliveryStarted(id)) startSent += 1
    }
  } catch (e) {
    console.error("[platinum-notifs] starters:", e)
  }

  // J-7 : entre maintenant et +7.5j, pas encore rappel
  try {
    const ending = await db.execute(sql`
      SELECT id FROM users
      WHERE free_delivery_until IS NOT NULL
        AND free_delivery_until > NOW()
        AND free_delivery_until <= NOW() + INTERVAL '7 days 12 hours'
        AND free_delivery_ending_notified_at IS NULL
      LIMIT 100
    `)
    for (const id of parseIds(ending)) {
      if (await notifyPlatinumFreeDeliveryEnding(id)) endingSent += 1
    }
  } catch (e) {
    console.error("[platinum-notifs] ending:", e)
  }

  return { startSent, endingSent }
}
