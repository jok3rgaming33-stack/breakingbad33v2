"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages, products, users } from "@/lib/db/schema"
import { and, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { normalizeStatus, statusMeta } from "@/lib/order-status"
import { computeLoyaltyPoints, PLATINUM_FREE_DELIVERY_POINTS_COST } from "@/lib/loyalty"
import { getCustomerStats } from "@/app/actions/account"
// computeLoyaltyPoints encore utilisé ailleurs ; award multi via account
import { notifyCustomer, notifyVendor } from "@/lib/push"
import { adjustStock } from "@/app/actions/products"
import { createXmrPaymentForOrder } from "@/app/actions/crypto-payment"
import { getPaysafecardConfig } from "@/app/actions/settings"
import { PAYSAFECARD_OFFICIAL } from "@/lib/paysafecard"
import { adminThreadUrl, clientThreadUrl, sectionForThreadStatus } from "@/lib/deep-links"

export type LockerPaymentMethod = "xmr" | "paysafecard"

/** Normalise l'ancien "wiro" vers paysafecard. */
function normalizeLockerPay(raw: string | null | undefined): LockerPaymentMethod | null {
  if (!raw) return null
  if (raw === "paysafecard" || raw === "wiro" || raw === "psc") return "paysafecard"
  if (raw === "xmr") return "xmr"
  return null
}

export type NewOrderInput = {
  customerName: string
  customerToken?: string
  summary: string
  products?: string
  // IDs numériques des produits commandés — utilisés pour la notation post-livraison.
  productIds?: number[]
  total: number
  /** Remise promo globale (€) — info panier */
  promoDiscount?: number
  /** Remise code fidélité (€) — pour CA statut sans rétrograder le palier */
  loyaltyDiscount?: number
  /** Platine hors mois offert : déduire 150 pts pour livraison gratuite */
  redeemFreeDeliveryPoints?: boolean
  fulfillment: "livraison" | "meetup" | "locker"
  address?: string
  lat?: number | null
  lng?: number | null
  scheduledDate?: string
  scheduledSlot?: string
  /** Locker uniquement : xmr | paysafecard */
  paymentMethod?: LockerPaymentMethod | "wiro" | null
}

/** Colonnes order_threads / thread_messages potentiellement absentes sur anciennes bases.
 *  Promise unique : les 11 lectures admin en parallèle ne doivent PAS lancer 11× ALTER
 *  (locks PostgreSQL / Neon → hang infini du panel). */
let orderSchemaPromise: Promise<void> | null = null
async function ensureOrderSchema() {
  if (!orderSchemaPromise) {
    orderSchemaPromise = (async () => {
      try {
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS product_ids JSONB NOT NULL DEFAULT '[]'::jsonb
        `)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_method TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS wiro_identifier TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS xmr_wallet TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS colissimo_number TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS client_last_seen TIMESTAMPTZ`)
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS deposit_notified BOOLEAN NOT NULL DEFAULT false
        `)
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS deposit_confirmed BOOLEAN NOT NULL DEFAULT false
        `)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_provider TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_provider_id TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_status TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_crypto TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_amount_crypto TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_amount_eur INTEGER`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_pay_url TEXT`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS payment_pay_address TEXT`)
        // Top5 / rappels locker
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS locker_reminder_count INTEGER NOT NULL DEFAULT 0
        `)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS locker_last_reminder_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_discount INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_points_awarded INTEGER`)
        // Lecture messages côté client
        await db.execute(sql`ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS client_read_at TIMESTAMPTZ`)
        // Suivi graphique (historique + ETA) + lien Mode tournée
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS tracking JSONB NOT NULL DEFAULT '{}'::jsonb
        `)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS run_token TEXT`)
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS order_threads_run_token_uidx
          ON order_threads (run_token)
          WHERE run_token IS NOT NULL
        `)
      } catch (e) {
        orderSchemaPromise = null
        console.error("[messaging] ensureOrderSchema:", e)
        throw e
      }
    })()
  }
  try {
    await orderSchemaPromise
  } catch {
    /* non bloquant : les SELECT peuvent encore réussir */
  }
}

/** Envoie le token TRK en fil messagerie (discussion) — après confirmation paiement. */
async function sendTrkTokenMessage(opts: {
  orderId: number
  trackingToken: string
  customerName: string
  customerToken: string | null
}) {
  const trkBody = [
    `⚠️ ATTENTION — LIS CE MESSAGE ATTENTIVEMENT ⚠️`,
    ``,
    `Ton paiement a été confirmé. Voici ton token de suivi Locker pour la commande #${opts.orderId} :`,
    ``,
    `${opts.trackingToken}`,
    ``,
    `SAUVEGARDE CE TOKEN MAINTENANT.`,
    `Ce message sera automatiquement supprimé une fois que tu l'auras ouvert, pour des raisons de sécurité.`,
    `Sans ce token tu ne pourras plus accéder au suivi de ta commande (onglet « En locker »).`,
  ].join("\n")

  const [trkThread] = await db
    .insert(orderThreads)
    .values({
      customerName: opts.customerName,
      customerToken: opts.customerToken,
      trackingToken: `TRK_MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      summary: `Token de suivi — Commande #${opts.orderId}`,
      total: 0,
      fulfillment: "locker",
      status: "trk_token",
    })
    .returning()

  await db.insert(threadMessages).values({
    threadId: trkThread.id,
    sender: "vendeur",
    body: trkBody,
  })

  await notifyCustomer(opts.customerToken, {
    title: "Token de suivi Locker — À SAUVEGARDER",
    body: "Paiement confirmé. Ouvre ta messagerie pour récupérer ton token TRK_ (supprimé après lecture).",
    url: clientThreadUrl("orders", trkThread.id),
    tag: `trk-${opts.orderId}`,
    threadId: trkThread.id,
    open: "orders",
  }).catch(() => {})

  return trkThread.id
}

// Crée un fil de commande + génère le token de suivi + envoie le message initial au client.
// Ne lève plus d'exception vers le client : retourne { ok: false, error } en cas d'échec.
export async function createOrderThread(input: NewOrderInput) {
  try {
    await ensureOrderSchema()

    const name = input.customerName?.trim() || "Client"
    const trackingToken = `TRK_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
    const isLocker = input.fulfillment === "locker"
    const paymentMethod: LockerPaymentMethod | null = isLocker
      ? normalizeLockerPay(input.paymentMethod) ?? "xmr"
      : null

    const loyaltyDiscount = Math.max(0, Math.trunc(Number(input.loyaltyDiscount) || 0))
    const token = input.customerToken?.trim() || null

    if (input.fulfillment === "livraison") {
      const { assertDeliverySlotAvailable } = await import("@/app/actions/delivery-slots")
      const slotOk = await assertDeliverySlotAvailable(input.scheduledDate, input.scheduledSlot)
      if (!slotOk.ok) return slotOk
    }

    // Platine hors mois offert : débit 150 pts pour livraison gratuite
    let redeemedFreeDelivery = false
    if (input.redeemFreeDeliveryPoints && token && input.fulfillment === "livraison") {
      const stats = await getCustomerStats(token)
      if (
        stats.tierId === "platinum" &&
        !stats.freeDeliveryActive &&
        stats.points >= PLATINUM_FREE_DELIVERY_POINTS_COST
      ) {
        const [u] = await db.select().from(users).where(eq(users.token, token)).limit(1)
        if (u) {
          await db
            .update(users)
            .set({ loyaltySpent: (u.loyaltySpent ?? 0) + PLATINUM_FREE_DELIVERY_POINTS_COST })
            .where(eq(users.id, u.id))
          redeemedFreeDelivery = true
        }
      } else {
        return {
          ok: false as const,
          error: "Solde insuffisant ou palier Platine / mois offert non éligible pour la livraison à 150 pts.",
        }
      }
    }

    const [thread] = await db
      .insert(orderThreads)
      .values({
        customerName: name,
        customerToken: token,
        trackingToken,
        summary: input.summary,
        products: input.products?.trim() || null,
        productIds: input.productIds ?? [],
        total: input.total,
        fulfillment: input.fulfillment,
        address: input.address?.trim() || null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        scheduledDate: input.scheduledDate ?? null,
        scheduledSlot: input.scheduledSlot ?? null,
        status: "en_attente",
        paymentMethod,
        loyaltyDiscount,
        tracking: { history: { en_attente: new Date().toISOString() } },
      })
      .returning()

    // Message initial du client (résumé de la commande)
    await db.insert(threadMessages).values({
      threadId: thread.id,
      sender: "client",
      body: input.summary,
    })

    if (redeemedFreeDelivery) {
      await db.insert(threadMessages).values({
        threadId: thread.id,
        sender: "vendeur",
        body: `💎 Livraison offerte — ${PLATINUM_FREE_DELIVERY_POINTS_COST} points Platine débités.`,
      })
    }

    if (isLocker) {
      // Locker : pas de token TRK tout de suite — envoyé après confirmation du paiement.
      if (paymentMethod === "paysafecard") {
        let extraInstructions = ""
        try {
          const cfg = await getPaysafecardConfig()
          extraInstructions = cfg.instructions?.trim() || ""
        } catch {
          /* ignore */
        }

        const lines = [
          `Merci pour ta commande Locker #${thread.id} !`,
          ``,
          `Mode de paiement : Paysafecard (code prépayé).`,
          `Total à régler : ${input.total}€`,
          ``,
          `⚠️ Achète UNIQUEMENT sur le site officiel Paysafecard :`,
          PAYSAFECARD_OFFICIAL.home,
          ``,
          `Acheter en ligne (officiel) :`,
          PAYSAFECARD_OFFICIAL.buyOnline,
          ``,
          `Trouver un point de vente (officiel) :`,
          PAYSAFECARD_OFFICIAL.findStore,
          ``,
          extraInstructions ||
            `Achète un ticket du montant exact (ou supérieur), puis envoie le code à 16 chiffres dans ce fil après validation vendeur.`,
          ``,
          `Après validation de ta commande, envoie le PIN ici et clique sur « J'ai envoyé mon code Paysafecard ».`,
          `Dès confirmation du code, tu recevras ton token TRK_ en messagerie pour débloquer le suivi Locker.`,
        ]

        await db.insert(threadMessages).values({
          threadId: thread.id,
          sender: "vendeur",
          body: lines.join("\n"),
        })
      } else {
        // XMR locker
        await db.insert(threadMessages).values({
          threadId: thread.id,
          sender: "vendeur",
          body: [
            `Merci pour ta commande Locker #${thread.id} !`,
            ``,
            `Mode de paiement : Monero (XMR).`,
            `Total à régler : ${input.total}€`,
            ``,
            `Après validation par le vendeur, tu recevras l'adresse de dépôt XMR (ou un lien de paiement).`,
            `Une fois le dépôt effectué, signale-le dans ton suivi.`,
            `Dès confirmation du paiement, tu recevras ton token TRK_ en messagerie pour débloquer le suivi Locker.`,
          ].join("\n"),
        })
      }
    } else {
      // Meet-up & livraison domicile : paiement en espèces uniquement (pas de crypto).
      const modeLabel =
        input.fulfillment === "meetup" ? "meet-up" : "livraison à domicile"
      await db.insert(threadMessages).values({
        threadId: thread.id,
        sender: "vendeur",
        body: [
          `Merci pour ta commande ! Elle a bien été prise en compte (${modeLabel}).`,
          ``,
          `Paiement : espèces uniquement, sur place.`,
          `Tu recevras une mise à jour dès qu'elle sera traitée.`,
        ].join("\n"),
      })
    }

    // Notifie le vendeur (best-effort)
    await notifyVendor({
      title: "Nouvelle commande",
      body: `${name} vient de passer une commande (#${thread.id})${
        isLocker ? ` — LOCKER (${paymentMethod === "paysafecard" ? "Paysafecard" : "XMR"})` : ""
      }.`,
      url: adminThreadUrl(isLocker ? "locker" : "commandes-en-cours", thread.id),
      tag: `order-${thread.id}`,
      threadId: thread.id,
      open: isLocker ? "locker" : "commandes-en-cours",
    }).catch(() => {})

    // Paiement XMR NOWPayments — UNIQUEMENT Locker + XMR (jamais livraison / meet-up : espèces).
    // Bug corrigé : l'ancienne condition `paymentMethod !== "paysafecard"` était vraie quand
    // paymentMethod = null (livraison/meetup) → invoice crypto créée par erreur.
    let cryptoPayment: {
      enabled: boolean
      payUrl?: string | null
      payAddress?: string | null
      payAmount?: string | null
      paymentStatus?: string
      error?: string
    } = { enabled: false }

    if (isLocker && paymentMethod === "xmr") {
      try {
        const invPromise = createXmrPaymentForOrder({
          threadId: thread.id,
          totalEur: input.total,
          customerToken: input.customerToken,
          customerName: name,
        })
        const inv = await Promise.race([
          invPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
        ])
        if (inv && inv.ok) {
          cryptoPayment = {
            enabled: true,
            payUrl: inv.payUrl,
            payAddress: inv.payAddress,
            payAmount: inv.payAmount,
            paymentStatus: inv.paymentStatus,
          }
          if (inv.payAddress) {
            try {
              await db
                .update(orderThreads)
                .set({ xmrWallet: inv.payAddress })
                .where(eq(orderThreads.id, thread.id))
            } catch {
              /* non bloquant */
            }
          }
        } else if (inv && !inv.ok && !inv.skipped) {
          cryptoPayment = { enabled: false, error: inv.error }
          console.error("[createOrderThread] XMR payment skipped:", inv.error)
        } else if (inv === null) {
          console.error("[createOrderThread] XMR payment timed out (12s) — commande OK sans gateway")
        }
      } catch (e) {
        console.error("[createOrderThread] crypto error:", e)
      }
    }

    try {
      revalidatePath("/messagerie")
      revalidatePath("/admin")
    } catch {
      /* ignore */
    }

    return {
      ok: true as const,
      id: thread.id,
      trackingToken,
      cryptoPayment,
      paymentMethod,
    }
  } catch (e) {
    console.error("[createOrderThread] FATAL:", e)
    return {
      ok: false as const,
      error: "Impossible d'enregistrer la commande. Réessaie dans un instant.",
    }
  }
}

// Crée une discussion générale (sans commande) : le client contacte directement le chimiste.
export async function createGeneralInquiryThread(input: {
  customerName: string
  customerToken?: string
  message: string
}) {
  const name = input.customerName?.trim() || "Client"
  const body = input.message?.trim()
  if (!body) return { ok: false as const }

  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: name,
      customerToken: input.customerToken?.trim() || null,
      trackingToken: `MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
      summary: "Discussion générale",
      total: 0,
      fulfillment: "livraison",
      status: "discussion",
    })
    .returning()

  await db.insert(threadMessages).values({ threadId: thread.id, sender: "client", body })

  await notifyVendor({
    title: `Message de ${name}`,
    body: body.length > 80 ? `${body.slice(0, 77)}…` : body,
    url: adminThreadUrl("messagerie", thread.id),
    tag: `thread-${thread.id}`,
    threadId: thread.id,
    open: "messagerie",
  }).catch(() => {})

  revalidatePath("/messagerie")
  revalidatePath("/admin")
  return { ok: true as const, id: thread.id }
}

// Fils affichés dans le récap commandes :
// - exclut les notifications broadcast
// - exclut les discussions directes (status discussion/pris_en_charge/ouvert/ferme)
// - exclut les fils sans article (total = 0 ou null) → ils vont dans Messagerie
export async function getThreads() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(
      and(
        ne(orderThreads.status, "notification"),
        notInArray(orderThreads.status, ["discussion", "pris_en_charge", "ouvert", "ferme"]),
        gt(orderThreads.total, 0),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Statuts réservés à la Messagerie — exclus de toutes les vues Commandes
const DISCUSSION_STATUSES = ["discussion", "pris_en_charge", "ouvert", "ferme"] as const

// Commandes actives hors locker : tout sauf "livree", "annulee", discussions et fulfillment locker
export async function getActiveOrders() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(
      and(
        notInArray(orderThreads.status, ["livree", "annulee", "notification", "trk_token", ...DISCUSSION_STATUSES]),
        ne(orderThreads.fulfillment, "locker"),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Commandes Locker Mondial Relay actives (non livrees, non annulees, hors fils TRK et discussions)
export async function getLockerOrders() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.fulfillment, "locker"),
        notInArray(orderThreads.status, ["livree", "annulee", "trk_token", ...DISCUSSION_STATUSES]),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Commandes clôturées (livree ou annulee), toutes livraisons confondues, sans discussions
export async function getPastOrders() {
  return db
    .select()
    .from(orderThreads)
    .where(
      and(
        or(
          eq(orderThreads.status, "livree"),
          eq(orderThreads.status, "annulee"),
        ),
        notInArray(orderThreads.status, ["trk_token", ...DISCUSSION_STATUSES]),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Discussions directes — Or/Platine en tête (file prioritaire), puis activité récente
export async function getDiscussions() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(inArray(orderThreads.status, ["discussion", "pris_en_charge", "ouvert", "ferme"]))
    .orderBy(desc(orderThreads.updatedAt))

  // Enrichit avec priorité palier (peak_tier utilisateur)
  try {
    const { users } = await import("@/lib/db/schema")
    const { tierRank, getTierById, formatPseudoWithTier } = await import("@/lib/loyalty")
    const tokens = [...new Set(threads.map((t) => t.customerToken).filter(Boolean) as string[])]
    if (tokens.length === 0) return threads

    const userRows = await db
      .select({ token: users.token, peakTier: users.peakTier, pseudo: users.pseudo })
      .from(users)
      .where(inArray(users.token, tokens))

    const byToken = new Map(userRows.map((u) => [u.token, u]))

    const enriched = threads.map((t) => {
      const u = t.customerToken ? byToken.get(t.customerToken) : undefined
      const tier = getTierById(u?.peakTier)
      return {
        ...t,
        // pseudo affiché avec emoji pour Or/Platine
        customerName: formatPseudoWithTier(t.customerName, tier.id),
        _priority: tier.priorityMessaging ? tierRank(tier.id) : 0,
        _tierId: tier.id as string,
      }
    })

    enriched.sort((a, b) => {
      if (b._priority !== a._priority) return b._priority - a._priority
      const ta = new Date(a.updatedAt).getTime()
      const tb = new Date(b.updatedAt).getTime()
      return tb - ta
    })

    // Retire les champs internes avant envoi client (sérialisation OK si on les laisse — mieux les garder pour l'UI)
    return enriched
  } catch (e) {
    console.error("[messaging] getDiscussions priority enrich:", e)
    return threads
  }
}

// Détail d'un fil avec tous ses messages (ordre chronologique)
export async function getThread(id: number) {
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, id))
  if (!thread) return null
  let messages: (typeof threadMessages.$inferSelect)[]
  try {
    messages = await db
      .select()
      .from(threadMessages)
      .where(eq(threadMessages.threadId, id))
      .orderBy(threadMessages.createdAt)
  } catch (e) {
    // Fallback minimal (id, thread, sender, body, created_at) si schéma partiel
    console.error("[messaging] getThread messages select failed, raw fallback:", e)
    const raw = await db.execute(sql`
      SELECT id, thread_id AS "threadId", sender, body, created_at AS "createdAt"
      FROM thread_messages
      WHERE thread_id = ${id}
      ORDER BY created_at ASC
    `)
    const rows = (raw as unknown as { rows?: Record<string, unknown>[] })?.rows
      ?? (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
    messages = rows.map((r) => ({
      id: Number(r.id),
      threadId: Number(r.threadId ?? r.thread_id),
      sender: String(r.sender ?? ""),
      body: String(r.body ?? ""),
      createdAt: (r.createdAt ?? r.created_at) as Date,
      clientReadAt: null,
    }))
  }
  return { thread, messages }
}

// Lecture client : l'identifiant du fil seul ne suffit jamais.
export async function getThreadForToken(id: number, customerToken: string) {
  const token = customerToken?.trim()
  if (!id || !token) return null
  const [thread] = await db
    .select()
    .from(orderThreads)
    .where(and(eq(orderThreads.id, id), eq(orderThreads.customerToken, token)))
  if (!thread) return null
  try {
    const messages = await db
      .select()
      .from(threadMessages)
      .where(eq(threadMessages.threadId, id))
      .orderBy(threadMessages.createdAt)
    return { thread, messages }
  } catch (e) {
    console.error("[messaging] getThreadForToken messages:", e)
    const raw = await db.execute(sql`
      SELECT id, thread_id AS "threadId", sender, body, created_at AS "createdAt"
      FROM thread_messages
      WHERE thread_id = ${id}
      ORDER BY created_at ASC
    `)
    const rows = (raw as unknown as { rows?: Record<string, unknown>[] })?.rows
      ?? (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
    const messages = rows.map((r) => ({
      id: Number(r.id),
      threadId: Number(r.threadId ?? r.thread_id),
      sender: String(r.sender ?? ""),
      body: String(r.body ?? ""),
      createdAt: (r.createdAt ?? r.created_at) as Date,
      clientReadAt: null as Date | null,
    }))
    return { thread, messages }
  }
}

// Supprime un message unique d'un fil (admin uniquement, sans impact sur le statut ou le total).
export async function deleteMessage(messageId: number) {
  if (!messageId) return { ok: false as const }
  await db.delete(threadMessages).where(eq(threadMessages.id, messageId))
  revalidatePath("/admin")
  return { ok: true as const }
}

// Ajoute un message dans un fil (vendeur ou client).
// Un message client doit toujours fournir le token du compte connecté.
export async function addMessage(
  threadId: number,
  sender: "client" | "vendeur",
  body: string,
  customerToken?: string,
) {
  const text = body?.trim()
  if (!text) return { ok: false }

  if (sender === "client") {
    const token = customerToken?.trim()
    if (!token) return { ok: false }
    const [ownedThread] = await db
      .select({ id: orderThreads.id })
      .from(orderThreads)
      .where(and(eq(orderThreads.id, threadId), eq(orderThreads.customerToken, token)))
      .limit(1)
    if (!ownedThread) return { ok: false }
  }

  await db.insert(threadMessages).values({ threadId, sender, body: text })
  // Le statut reste un choix délibéré du vendeur : on ne met à jour que la date.
  await db
    .update(orderThreads)
    .set({ updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))

  // Notification push à l'autre partie.
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (thread) {
    // Nettoie les balises média pour le preview push (ex: [image]url[/image] → "Photo jointe")
    const cleanPreview = text
      .replace(/\[image\][^\]]*\[\/image\]/gi, "📷 Photo jointe")
      .replace(/\[video\][^\]]*\[\/video\]/gi, "🎥 Video jointe")
      .replace(/\[audio\][^\]]*\[\/audio\]/gi, "🎤 Message vocal")
      .trim()
    const preview = cleanPreview.length > 80 ? `${cleanPreview.slice(0, 77)}…` : cleanPreview
    if (sender === "vendeur") {
      const section = sectionForThreadStatus(thread.status)
      await notifyCustomer(thread.customerToken, {
        title: "Nouveau message du vendeur",
        body: preview,
        url: clientThreadUrl(section, threadId),
        tag: `thread-${threadId}`,
        threadId,
        open: section,
      }).catch(() => {})
    } else {
      const isDiscussion = ["discussion", "pris_en_charge", "ouvert", "ferme"].includes(
        thread.status || "",
      )
      const tab = isDiscussion
        ? "messagerie"
        : thread.fulfillment === "locker"
          ? "locker"
          : "commandes-en-cours"
      await notifyVendor({
        title: `Message de ${thread.customerName}`,
        body: preview,
        url: adminThreadUrl(tab, threadId),
        tag: `thread-${threadId}`,
        threadId,
        open: tab,
      }).catch(() => {})
    }
  }

  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  return { ok: true }
}

// Met à jour le statut d'un fil.
// Plus de message texte auto : le suivi graphique + une notification push/cloche suffisent.
// Exception : invitation de notation à la livraison (CTA, pas un statut).
// Optionnellement met à jour le numéro Colissimo quand la commande est expédiée.
// Pour "livree", les points de fidélité sont crédités (voir getCustomerStats).
export async function updateThreadStatus(
  threadId: number,
  status: string,
  reason?: string,
  colissimoNumber?: string
) {
  await ensureOrderSchema()
  const [current] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!current) return { ok: false }

  const prevKey = normalizeStatus(current.status)
  const nextKey = normalizeStatus(status)

  const prevTracking =
    current.tracking && typeof current.tracking === "object" ? current.tracking : {}
  const history: Record<string, string> = {
    ...((prevTracking as { history?: Record<string, string> }).history ?? {}),
  }
  if (!history.en_attente && current.createdAt) {
    history.en_attente = new Date(current.createdAt).toISOString()
  }
  if (nextKey !== prevKey) {
    history[nextKey] = new Date().toISOString()
  }

  const tracking: {
    history: Record<string, string>
    etaMin?: number | null
    etaAt?: string | null
    etaArriveBy?: string | null
    cancelReason?: string | null
  } = {
    ...prevTracking,
    history,
  }

  if (reason?.trim()) tracking.cancelReason = reason.trim()

  // Mise à jour du statut et optionnellement du numéro Colissimo / token tournée
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: sql`now()`,
    tracking,
  }
  if (colissimoNumber?.trim()) {
    updateData.colissimoNumber = colissimoNumber.trim()
  }

  let runToken = current.runToken
  if ((nextKey === "livraison" || nextKey === "arrivee") && !runToken) {
    runToken = `RUN_${crypto.randomUUID().replace(/-/g, "")}`
    updateData.runToken = runToken
  }

  let notifyBody: string | null = null
  let etaMin: number | null = null

  if (nextKey !== prevKey) {
    switch (nextKey) {
      case "pris_en_charge":
        notifyBody = "Ta demande a bien été reçue et est en cours de traitement."
        break
      case "ouvert":
        notifyBody = "Ta discussion est ouverte."
        break
      case "ferme":
        notifyBody = "Cette discussion a été clôturée."
        break
      case "validee":
        notifyBody = "Ta commande a été validée et prise en charge."
        break
      case "preparation":
        notifyBody = "Tes articles sont en cours de préparation."
        break
      case "pret_meetup":
        notifyBody = "Ton colis est prêt à récupérer."
        break
      case "bientot_livraison":
        notifyBody = "Ton colis sera bientôt pris en charge. Reste joignable."
        break
      case "livraison": {
        if (current.fulfillment === "livraison") {
          try {
            const { getDeliveryEtaForThread } = await import("@/app/actions/drive-eta")
            const { formatEtaNotifyLine } = await import("@/lib/drive-eta")
            const eta = await getDeliveryEtaForThread(threadId)
            if (eta) {
              etaMin = eta.etaMin
              tracking.etaMin = eta.etaMin
              tracking.etaAt = new Date().toISOString()
              tracking.etaArriveBy = new Date(Date.now() + eta.etaMin * 60 * 1000).toISOString()
              updateData.tracking = tracking
              notifyBody = `Le livreur est en route. ${formatEtaNotifyLine(eta.etaMin)}`
            }
          } catch (e) {
            console.error("[updateThreadStatus] ETA failed:", e)
          }
        }
        if (!notifyBody) {
          notifyBody =
            current.fulfillment === "locker"
              ? "Ton colis est déposé en locker."
              : "Le livreur est en route. Reste joignable."
        }
        break
      }
      case "arrivee":
        notifyBody = "Le livreur est arrivé à destination. Sors ou reste joignable."
        break
      case "livree": {
        const mode =
          current.fulfillment === "meetup"
            ? "en meet-up"
            : current.fulfillment === "locker"
              ? "en locker"
              : "en livraison"
        let points = computeLoyaltyPoints(current.total ?? 0)
        let multiLine = ""
        try {
          const { awardLoyaltyOnDelivery } = await import("@/app/actions/account")
          const award = await awardLoyaltyOnDelivery({
            customerToken: current.customerToken,
            orderId: threadId,
            orderTotal: current.total ?? 0,
            loyaltyDiscount: (current as { loyaltyDiscount?: number }).loyaltyDiscount ?? 0,
          })
          points = award.points
          if (award.multiplier > 1) {
            multiLine = ` (palier ${award.tierLabel} ×${award.multiplier})`
          }
        } catch {
          /* multi non bloquant — base 1€=1pt */
        }
        let referralLine = ""
        try {
          const { grantReferralBonusOnFirstDelivery } = await import("@/app/actions/account")
          const ref = await grantReferralBonusOnFirstDelivery(current.customerToken)
          if (ref.granted && ref.refereeBonus) {
            referralLine = ` Bonus parrainage : +${ref.refereeBonus} pts.`
          }
        } catch {
          /* non bloquant */
        }
        notifyBody =
          `Commande livrée (${mode}).` +
          (points > 0
            ? ` +${points} pt${points > 1 ? "s" : ""} fidélité${multiLine}.`
            : "") +
          referralLine
        break
      }
      case "annulee": {
        const motif = reason?.trim()
        notifyBody = motif ? `Commande annulée. Motif : ${motif}` : "Commande annulée."
        break
      }
    }
  }

  await db
    .update(orderThreads)
    .set(updateData)
    .where(eq(orderThreads.id, threadId))

  if (nextKey !== prevKey && notifyBody) {
    // Invitation notation : reste un message (CTA), pas un statut.
    if (nextKey === "livree") {
      const ratingBody = [
        "[NOTER_PRODUITS]",
        "Chaque avis compte — surtout le tien.",
        "Même si tu as déjà noté ce produit, un nouveau retour à chaque commande montre que tu reviens, et ça rassure ceux qui découvrent encore le labo.",
        "1 minute, et tu aides tout le monde.",
      ].join("\n")
      try {
        await db.insert(threadMessages).values({
          threadId,
          sender: "vendeur",
          body: ratingBody,
        })
        await notifyCustomer(current.customerToken, {
          title: "Note ton expérience ⭐",
          body: "Même si tu l'as déjà fait : un nouvel avis à chaque commande, ça compte.",
          url: clientThreadUrl(
            current.fulfillment === "locker" ? "locker" : "orders",
            threadId,
          ),
          tag: `rating-invite-${threadId}`,
          threadId,
          open: current.fulfillment === "locker" ? "locker" : "orders",
        }).catch(() => {})
      } catch (e) {
        console.error("[updateThreadStatus] rating invite failed:", e)
      }
    }

    await notifyCustomer(current.customerToken, {
      title: `Commande #${threadId} — ${statusMeta(nextKey).label}`,
      body: notifyBody,
      url: clientThreadUrl(
        current.fulfillment === "locker" ? "locker" : "orders",
        threadId,
      ),
      tag: `status-${threadId}`,
      threadId,
      open: current.fulfillment === "locker" ? "locker" : "orders",
    }).catch(() => {})
  }

  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  revalidatePath("/admin")
  return { ok: true, runToken: runToken ?? null, etaMin }
}

/** Ping client : « je suis là dans X minutes » (message + push, sans changer le statut). */
export async function notifyArrivingInMinutes(threadId: number, minutes = 5) {
  if (!threadId || minutes < 1) return { ok: false as const, error: "Paramètres invalides." }
  const [current] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!current) return { ok: false as const, error: "Commande introuvable." }
  const key = normalizeStatus(current.status)
  if (key !== "livraison" && key !== "arrivee") {
    return { ok: false as const, error: "La commande n'est pas en livraison." }
  }

  const body = `Je suis là dans ${minutes} minute${minutes > 1 ? "s" : ""}. Reste joignable.`
  const prevTracking =
    current.tracking && typeof current.tracking === "object" ? current.tracking : {}
  const arriveBy = new Date(Date.now() + minutes * 60 * 1000).toISOString()

  await db.insert(threadMessages).values({ threadId, sender: "vendeur", body })
  await db
    .update(orderThreads)
    .set({
      updatedAt: sql`now()`,
      tracking: {
        ...prevTracking,
        etaMin: minutes,
        etaAt: new Date().toISOString(),
        etaArriveBy: arriveBy,
      },
    })
    .where(eq(orderThreads.id, threadId))

  await notifyCustomer(current.customerToken, {
    title: `Commande #${threadId} — dans ${minutes} min`,
    body,
    url: clientThreadUrl(
      current.fulfillment === "locker" ? "locker" : "orders",
      threadId,
    ),
    tag: `eta5-${threadId}`,
    threadId,
    open: current.fulfillment === "locker" ? "locker" : "orders",
  }).catch(() => {})

  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true as const }
}

// Vue client : ses fils filtrés par pseudo (compat héritée)
export async function getThreadsForCustomer(customerName: string) {
  const name = customerName?.trim()
  if (!name) return []
  return db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.customerName, name))
    .orderBy(desc(orderThreads.updatedAt))
}

// Vue client onglet "En locker" : commandes locker du client, identifiées par son customerToken
export async function getLockerOrdersForToken(customerToken: string) {
  const token = customerToken?.trim()
  if (!token) return []
  return db
    .select()
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.customerToken, token),
        eq(orderThreads.fulfillment, "locker"),
        ne(orderThreads.status, "trk_token"), // exclure les fils TRK — ils s'affichent dans "En cours"
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Vue client messagerie + commandes :
// - commandes non-locker
// - fils trk_token (locker) : alerte ambre "token à sauvegarder"
// - fils status "notification" : broadcast admin → onglet Discussions (pas Commandes côté UI)
// Les vraies commandes locker (non-trk) sont dans getLockerOrdersForToken.
export async function getThreadsForToken(customerToken: string) {
  const token = customerToken?.trim()
  if (!token) return []
  return db
    .select()
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.customerToken, token),
        or(
          eq(orderThreads.status, "notification"), // notifs → messagerie Discussions
          ne(orderThreads.fulfillment, "locker"), // commandes normales + discussions
          eq(orderThreads.status, "trk_token"), // fils TRK locker à afficher en ambre
        ),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Marque un fil comme lu par l'admin (appel interne/admin).
export async function markThreadRead(threadId: number) {
  if (!threadId) return
  await db
    .update(orderThreads)
    .set({ clientLastSeen: sql`now()` })
    .where(eq(orderThreads.id, threadId))
  await db
    .update(threadMessages)
    .set({ clientReadAt: sql`now()` })
    .where(
      and(
        eq(threadMessages.threadId, threadId),
        eq(threadMessages.sender, "vendeur"),
        isNull(threadMessages.clientReadAt),
      )
    )
}

// Marque un fil comme lu par le client uniquement si le token possède ce fil.
// Pour les fils broadcast (trackingToken NOTIF_<id>_…), met aussi à jour notification_reads.
export async function markThreadReadForToken(threadId: number, customerToken: string) {
  const token = customerToken?.trim()
  if (!threadId || !token) return { ok: false as const }
  const result = await db
    .update(orderThreads)
    .set({ clientLastSeen: sql`now()` })
    .where(and(eq(orderThreads.id, threadId), eq(orderThreads.customerToken, token)))
    .returning({
      id: orderThreads.id,
      status: orderThreads.status,
      trackingToken: orderThreads.trackingToken,
    })
  if (!result.length) return { ok: false as const }
  await db
    .update(threadMessages)
    .set({ clientReadAt: sql`now()` })
    .where(
      and(
        eq(threadMessages.threadId, threadId),
        eq(threadMessages.sender, "vendeur"),
        isNull(threadMessages.clientReadAt),
      )
    )

  const row = result[0]
  if (row.status === "notification" && row.trackingToken?.startsWith("NOTIF_")) {
    const parts = row.trackingToken.split("_")
    const notifId = Number(parts[1])
    if (Number.isFinite(notifId) && notifId > 0) {
      try {
        const { markNotificationRead } = await import("@/app/actions/notifications")
        await markNotificationRead(notifId, token)
      } catch {
        // best-effort
      }
    }
  }

  return { ok: true as const }
}

function tsMs(d: Date | string | null | undefined): number {
  if (!d) return 0
  const t = new Date(d).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Non-lus client par section (badges menu + icône app).
 *
 * Un fil est non lu UNIQUEMENT s'il y a de l'activité vendeur non vue :
 * - au moins un message vendeur après clientLastSeen, ou
 * - jamais ouvert (clientLastSeen null) + au moins un message vendeur, ou
 * - statut trk_token jamais ouvert (message auto à lire)
 *
 * Ne compte plus les réponses du client lui-même (bug qui re-badgeait après envoi).
 *
 * - messaging : discussions + notifications broadcast
 * - orders    : commandes réelles + locker + trk
 */
export async function getUnreadCounts(
  customerToken: string,
): Promise<{ messaging: number; orders: number; total: number }> {
  const token = customerToken?.trim()
  if (!token) return { messaging: 0, orders: 0, total: 0 }

  const rows = await db
    .select({
      id: orderThreads.id,
      fulfillment: orderThreads.fulfillment,
      status: orderThreads.status,
      total: orderThreads.total,
      clientLastSeen: orderThreads.clientLastSeen,
      lastVendorAt: sql<Date | string | null>`(
        SELECT MAX(${threadMessages.createdAt})
        FROM ${threadMessages}
        WHERE ${threadMessages.threadId} = ${orderThreads.id}
          AND ${threadMessages.sender} = 'vendeur'
      )`,
    })
    .from(orderThreads)
    .where(eq(orderThreads.customerToken, token))

  let messaging = 0
  let orders = 0
  // Notifications broadcast comptent comme messagerie (onglet Discussions)
  const DISCUSSION = new Set(["discussion", "pris_en_charge", "ouvert", "ferme", "notification"])

  for (const r of rows) {
    const seenMs = tsMs(r.clientLastSeen)
    const vendorMs = tsMs(r.lastVendorAt)
    const isTrk = r.status === "trk_token"
    // Non lu = message vendeur plus récent que la dernière ouverture, ou TRK jamais ouvert
    const isUnread =
      (vendorMs > 0 && vendorMs > seenMs) || (isTrk && seenMs === 0)
    if (!isUnread) continue

    if (DISCUSSION.has(r.status)) {
      messaging++
    } else {
      orders++
    }
  }

  return { messaging, orders, total: messaging + orders }
}

/**
 * Compteurs admin pour pastilles rouges (panel + icône PWA vendeur).
 * - orders : nouvelles commandes + commandes en attente de réponse client
 * - locker : nouvelles commandes locker
 * - messaging : discussions dont le dernier message est du client
 * - verifications : KYC en attente
 * - recovery : dossiers récupération ouverts
 */
export async function getAdminBadgeCounts(): Promise<{
  orders: number
  locker: number
  messaging: number
  verifications: number
  recovery: number
  total: number
}> {
  const empty = { orders: 0, locker: 0, messaging: 0, verifications: 0, recovery: 0, total: 0 }
  try {
    const { isAdminAuthenticated } = await import("@/app/actions/admin-auth")
    if (!(await isAdminAuthenticated())) return empty
  } catch {
    return empty
  }

  const DISCUSSION = new Set(["discussion", "pris_en_charge", "ouvert", "ferme"])

  const threads = await db
    .select({
      id: orderThreads.id,
      fulfillment: orderThreads.fulfillment,
      status: orderThreads.status,
      lastSender: sql<string | null>`(
        SELECT m.sender
        FROM ${threadMessages} m
        WHERE m.thread_id = ${orderThreads.id}
        ORDER BY m.created_at DESC
        LIMIT 1
      )`,
    })
    .from(orderThreads)
    .where(notInArray(orderThreads.status, ["notification", "livree", "annulee", "trk_token"]))

  let orders = 0
  let locker = 0
  let messaging = 0

  for (const t of threads) {
    const isDiscussion = DISCUSSION.has(t.status)
    const waitingClient = t.lastSender === "client"
    const isNew = t.status === "en_attente" || t.status === "nouveau"

    if (isDiscussion) {
      if (waitingClient || t.status === "discussion") messaging++
      continue
    }

    if (t.fulfillment === "locker") {
      if (isNew || waitingClient) locker++
    } else {
      if (isNew || waitingClient) orders++
    }
  }

  let verifications = 0
  try {
    const { userVerifications } = await import("@/lib/db/schema")
    const [v] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(userVerifications)
      .where(eq(userVerifications.status, "pending"))
    verifications = v?.c ?? 0
  } catch {
    /* ignore */
  }

  let recovery = 0
  try {
    const rec = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM account_recovery_claims
      WHERE status IN ('pending_kyc', 'kyc_submitted')
    `)
    const raw = rec as unknown as { rows?: { c: number }[]; rowCount?: number } | { c: number }[]
    if (Array.isArray(raw)) {
      recovery = Number(raw[0]?.c) || 0
    } else if (raw?.rows) {
      recovery = Number(raw.rows[0]?.c) || 0
    }
  } catch {
    recovery = 0
  }

  const total = orders + locker + messaging + verifications + recovery
  return { orders, locker, messaging, verifications, recovery, total }
}

// Aperçu léger pour les notifications client : statut + nombre de messages du vendeur.
// Inclut les broadcast (status notification) pour la cloche + messagerie.
export async function getCustomerThreadsOverview(customerToken: string) {
  const token = customerToken?.trim()
  if (!token) return []
  const rows = await db
    .select({
      id: orderThreads.id,
      status: orderThreads.status,
      vendorCount: sql<number>`count(*) filter (where ${threadMessages.sender} = 'vendeur')::int`,
    })
    .from(orderThreads)
    .leftJoin(threadMessages, eq(threadMessages.threadId, orderThreads.id))
    .where(eq(orderThreads.customerToken, token))
    .groupBy(orderThreads.id, orderThreads.status)
  return rows
}

// Suivi public par token TRK_ : retourne le thread + messages sans authentification client.
// Seules les infos non-sensibles sont exposées (pas d'adresse, pas de coords).
export async function getThreadByTrackingToken(trackingToken: string) {
  const token = trackingToken?.trim().toUpperCase()
  if (!token || (!token.startsWith("TRK_") && !token.startsWith("MSG_"))) return null
  const [thread] = await db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.trackingToken, token))
  if (!thread) return null
  const messages = await db
    .select()
    .from(threadMessages)
    .where(eq(threadMessages.threadId, thread.id))
    .orderBy(threadMessages.createdAt)
  // Ne retourner que les messages du vendeur (notifications statut) — pas ceux du client
  const statusMessages = messages.filter((m) => m.sender === "vendeur")
  return {
    id: thread.id,
    status: thread.status,
    fulfillment: thread.fulfillment,
    scheduledDate: thread.scheduledDate,
    scheduledSlot: thread.scheduledSlot,
    colissimoNumber: thread.colissimoNumber,
    tracking: thread.tracking ?? {},
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: statusMessages,
  }
}

// Retourne les fils TRK_MSG en attente de lecture pour un token client donné.
export async function getTrkThreadsForToken(customerToken: string) {
  const token = customerToken?.trim()
  if (!token) return []
  return db
    .select()
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.customerToken, token),
        eq(orderThreads.status, "trk_token"),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Supprime le fil TRK_MSG après que le client l'a lu (sécurité : message auto-détruit).
export async function consumeTrkThread(threadId: number) {
  if (!threadId) return { ok: false as const }
  const [t] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!t || t.status !== "trk_token") return { ok: false as const }
  await db.delete(threadMessages).where(eq(threadMessages.threadId, threadId))
  await db.delete(orderThreads).where(eq(orderThreads.id, threadId))
  revalidatePath("/messagerie")
  return { ok: true as const }
}

// Admin : enregistre l'adresse wallet XMR et envoie un message au client dans son fil locker.
export async function sendXmrWallet(threadId: number, wallet: string) {
  const w = wallet.trim()
  if (!w || !threadId) return { ok: false as const }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const }

  await db
    .update(orderThreads)
    .set({ xmrWallet: w, paymentMethod: "xmr", status: "validee", updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))

  // Récupérer le taux XMR/EUR en temps réel pour indiquer le montant exact au client
  let xmrAmount: string | null = null
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=eur", {
      next: { revalidate: 60 },
    })
    const data = await res.json()
    const rate: number = data?.monero?.eur
    if (rate && thread.total) {
      xmrAmount = (thread.total / rate).toFixed(6)
    }
  } catch {
    /* taux indisponible */
  }

  const walletMsg = [
    `Commande validée ! Voici l'adresse du wallet Monero (XMR) où effectuer ton dépôt :`,
    ``,
    `[ ${w} ]`,
    ``,
    xmrAmount
      ? `Montant à envoyer : ${xmrAmount} XMR (= ${thread.total}€ au taux actuel)`
      : `Montant à envoyer : l'équivalent de ${thread.total}€ en XMR (vérifie le taux sur Kraken ou Binance).`,
    ``,
    `IMPORTANT : recopie cette adresse avec la plus grande attention, caractère par caractère.`,
    `Une seule erreur de saisie et le dépôt sera perdu définitivement — Monero est une crypto intraçable.`,
    ``,
    `Une fois le dépôt effectué, clique sur le bouton « J'ai effectué mon dépôt » dans ton suivi locker.`,
    `Dès confirmation du paiement, tu recevras ton token TRK_ en messagerie pour débloquer le suivi.`,
  ].join("\n")

  await db.insert(threadMessages).values({ threadId, sender: "vendeur", body: walletMsg })

  await notifyCustomer(thread.customerToken, {
    title: "Adresse de paiement XMR disponible",
    body: "Ouvre ton suivi locker pour voir l'adresse de dépôt Monero.",
    url: "/",
    tag: `xmr-${threadId}`,
  }).catch(() => {})

  revalidatePath("/admin")
  return { ok: true as const }
}

// Admin : valide une commande locker Paysafecard et envoie les instructions officielles.
export async function sendPaysafecardInstructions(threadId: number) {
  if (!threadId) return { ok: false as const, error: "id manquant" }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const, error: "commande introuvable" }

  let instructions = ""
  try {
    const cfg = await getPaysafecardConfig()
    instructions = cfg.instructions?.trim() || ""
  } catch {
    /* ignore */
  }

  await db
    .update(orderThreads)
    .set({
      paymentMethod: "paysafecard",
      status: "validee",
      updatedAt: sql`now()`,
    })
    .where(eq(orderThreads.id, threadId))

  const msg = [
    `Commande validée ! Paiement par Paysafecard.`,
    ``,
    `Montant à régler : ${thread.total}€ (ticket du montant exact ou supérieur).`,
    ``,
    `1️⃣ Achète ton code UNIQUEMENT sur le site officiel :`,
    PAYSAFECARD_OFFICIAL.home,
    ``,
    `   • Acheter en ligne : ${PAYSAFECARD_OFFICIAL.buyOnline}`,
    `   • Points de vente : ${PAYSAFECARD_OFFICIAL.findStore}`,
    ``,
    `2️⃣ Tu reçois un code PIN à 16 chiffres.`,
    ``,
    `3️⃣ Envoie ce code dans CE fil de suivi (message), puis clique sur « J'ai envoyé mon code Paysafecard ».`,
    ``,
    instructions ||
      `N'utilise aucun site tiers non officiel pour acheter le code.`,
    ``,
    `Dès vérification du code, tu recevras ton token TRK_ en messagerie pour débloquer le suivi Locker.`,
  ].join("\n")

  await db.insert(threadMessages).values({ threadId, sender: "vendeur", body: msg })

  await notifyCustomer(thread.customerToken, {
    title: "Paiement Paysafecard — instructions",
    body: "Achète ton code sur paysafecard.com (officiel) et envoie le PIN dans ton suivi Locker.",
    url: "/",
    tag: `psc-${threadId}`,
  }).catch(() => {})

  revalidatePath("/admin")
  return { ok: true as const }
}

/** @deprecated alias → sendPaysafecardInstructions */
export async function sendWiroPayment(threadId: number, _identifier?: string) {
  return sendPaysafecardInstructions(threadId)
}

// Client : signale que son dépôt (XMR ou Paysafecard) est effectué.
export async function notifyDeposit(threadId: number) {
  if (!threadId) return { ok: false as const }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const }

  const isPsc = normalizeLockerPay(thread.paymentMethod) === "paysafecard"
  const label = isPsc ? "Paysafecard" : "XMR"

  await db
    .update(orderThreads)
    .set({ depositNotified: true, updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))
  await db.insert(threadMessages).values({
    threadId,
    sender: "client",
    body: isPsc
      ? "J'ai acheté mon code Paysafecard et je l'ai envoyé (ou je l'envoie) dans ce fil. Merci de vérifier le PIN à 16 chiffres."
      : "J'ai effectué mon dépôt XMR. Merci de vérifier la réception.",
  })

  await notifyVendor({
    title: `Paiement ${label} signalé — Commande #${threadId}`,
    body: isPsc
      ? `${thread.customerName} a signalé l'envoi d'un code Paysafecard — vérifie le PIN dans le fil.`
      : `${thread.customerName} signale avoir effectué son dépôt Monero.`,
    url: "/admin",
    tag: `deposit-${threadId}`,
  }).catch(() => {})

  revalidatePath("/admin")
  return { ok: true as const }
}

// Représente un article dans la commande (envoyé depuis le panneau de gestion)
export type OrderProductItem = {
  productId: number
  title: string
  qty: number        // quantité choisie (0 = suppression)
  price: number      // prix unitaire pour cette quantité (variant)
  prevQty: number    // quantité précédente avant modification (pour l'ajustement stock)
}

// Admin : met à jour les articles d'une commande existante.
// - Recalcule le total (sous-total − promo + frais)
// - Ajuste le stock de chaque produit (delta = prevQty - newQty)
// - Envoie un message récapitulatif au client + push
export async function updateOrderProducts(
  threadId: number,
  items: OrderProductItem[],
  opts?: {
    promo?: AdminOrderPromo | null
    /** Frais livraison/locker à conserver (meetup = 0, locker = 10, livraison = montant saisi/préservé) */
    deliveryFee?: number
  },
) {
  if (!threadId || !items.length) return { ok: false as const, error: "Aucun article." }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const, error: "Commande introuvable." }

  const { computePromoDiscount } = await import("@/lib/promo-calc")

  // Calcul du nouveau total et des lignes de changement
  const changes: string[] = []

  for (const item of items) {
    const lineTotal = item.qty * item.price

    const delta = item.prevQty - item.qty // positif = stock rendu, négatif = stock consommé
    if (delta !== 0) {
      await adjustStock(item.productId, delta)
    }

    if (item.qty === 0) {
      changes.push(`- ${item.title} retiré de la commande (rupture de stock ou annulation de l'article).`)
    } else if (item.qty !== item.prevQty) {
      const diff = item.qty - item.prevQty
      const sign = diff > 0 ? `+${diff}` : `${diff}`
      changes.push(`- ${item.title} : quantité ${sign} (nouvelle qté : ${item.qty} × ${item.price}€ = ${lineTotal}€)`)
    }
  }

  // Reconstruit la colonne products (texte)
  const activeItems = items.filter((i) => i.qty > 0)
  if (activeItems.length === 0) {
    return { ok: false as const, error: "La commande doit contenir au moins un article." }
  }
  const newProducts = activeItems.map((i) => `${i.title} ×${i.qty}`).join(", ")

  // Reconstruit le summary complet (même format que la commande initiale)
  const lines: string[] = []
  for (const item of activeItems) {
    lines.push(`• ${item.qty}x ${item.title} — ${item.qty * item.price}€`)
  }
  const dateStr = thread.scheduledDate
    ? new Date(thread.scheduledDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  let deliveryLine = ""
  if (thread.fulfillment === "meetup") {
    deliveryLine = `Retrait sur place (meet-up)${thread.scheduledSlot ? ` à ${thread.scheduledSlot}` : ""}`
  } else if (thread.fulfillment === "locker") {
    deliveryLine = `Mondial Relay${thread.scheduledSlot ? ` — ${thread.scheduledSlot}` : ""}`
  } else {
    deliveryLine = `Livraison${thread.address ? ` à ${thread.address}` : ""}${thread.scheduledSlot ? ` — créneau ${thread.scheduledSlot}` : ""}`
  }

  const subTotal = activeItems.reduce((s, i) => s + i.qty * i.price, 0)
  const promo = opts?.promo ?? null
  const promoDiscount = computePromoDiscount(activeItems, subTotal, promo)

  if (promo && promo.minAmount > 0 && subTotal < promo.minAmount) {
    return {
      ok: false as const,
      error: `Minimum d'achat non atteint pour la promo (min. ${promo.minAmount}€, panier ${subTotal}€).`,
    }
  }
  if (promo?.type === "produit" && promoDiscount === 0) {
    return {
      ok: false as const,
      error: `Produit offert introuvable dans la commande (attendu : ${promo.productName ?? "—"}).`,
    }
  }

  const fee =
    opts?.deliveryFee != null
      ? Math.max(0, Math.trunc(Number(opts.deliveryFee) || 0))
      : thread.fulfillment === "locker"
        ? 10
        : thread.fulfillment === "meetup"
          ? 0
          : 0

  const newTotal = Math.max(0, subTotal + fee - promoDiscount)

  const promoLabel = promo
    ? promo.type === "percent"
      ? `-${promo.value}%`
      : promo.type === "produit"
        ? `${promo.value}× ${promo.productName ?? "produit"} offert`
        : `-${promo.value}€`
    : null

  if (promoDiscount > 0) {
    changes.push(
      `- Promo${promo?.code ? ` ${promo.code}` : ""}${promoLabel ? ` (${promoLabel})` : ""} : -${promoDiscount}€`,
    )
  }

  const newSummary = [
    `Commande mise à jour`,
    ...lines,
    `Date : ${dateStr}`,
    deliveryLine,
    `Sous-total : ${subTotal}€`,
    fee > 0 ? `${thread.fulfillment === "locker" ? "Locker" : "Livraison"} : ${fee}€` : null,
    promoDiscount > 0
      ? `Promo${promo?.code ? ` ${promo.code}` : ""}${promoLabel ? ` (${promoLabel})` : ""} : -${promoDiscount}€`
      : null,
    `TOTAL : ${newTotal}€`,
  ]
    .filter(Boolean)
    .join("\n")

  // productIds : source de vérité pour la notation (toujours resync)
  const newProductIds = [
    ...new Set(activeItems.map((i) => i.productId).filter((id) => Number.isFinite(id) && id > 0)),
  ]

  await db
    .update(orderThreads)
    .set({
      products: newProducts,
      productIds: newProductIds,
      total: newTotal,
      summary: newSummary,
      updatedAt: sql`now()`,
    })
    .where(eq(orderThreads.id, threadId))

  // Message récapitulatif au client (articles changés et/ou promo appliquée)
  if (changes.length > 0) {
    const body = [
      `Mise à jour de ta commande #${threadId} :`,
      ``,
      ...changes,
      ``,
      // Récap complet des articles après modification
      ...activeItems.map((i) => `• ${i.qty}x ${i.title} — ${i.qty * i.price}€`),
      ``,
      deliveryLine,
      fee > 0 ? `${thread.fulfillment === "locker" ? "Locker" : "Livraison"} : ${fee}€` : null,
      promoDiscount > 0
        ? `Promo${promo?.code ? ` ${promo.code}` : ""} : -${promoDiscount}€`
        : null,
      ``,
      `Nouveau total : ${newTotal}€`,
    ]
      .filter(Boolean)
      .join("\n")

    await db.insert(threadMessages).values({ threadId, sender: "vendeur", body })
    const open = thread.fulfillment === "locker" ? ("locker" as const) : ("orders" as const)
    await notifyCustomer(thread.customerToken, {
      title: `Commande #${threadId} modifiée`,
      body: `Total mis à jour : ${newTotal}€`,
      url: clientThreadUrl(open, threadId),
      tag: `order-update-${threadId}`,
      threadId,
      open,
    })
  }

  revalidatePath("/admin")
  return { ok: true as const, newTotal, newSummary, promoDiscount }
}

// Admin : confirme la réception du paiement (XMR ou Paysafecard), lance la préparation
// et envoie le token TRK_ en messagerie pour débloquer le suivi Locker.
export async function confirmDeposit(threadId: number) {
  if (!threadId) return { ok: false as const }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const }

  const isPsc = normalizeLockerPay(thread.paymentMethod) === "paysafecard"
  const payLabel = isPsc ? "Paysafecard" : "XMR"

  await db
    .update(orderThreads)
    .set({ depositConfirmed: true, status: "preparation", updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))

  await db.insert(threadMessages).values({
    threadId,
    sender: "vendeur",
    body: isPsc
      ? `Code Paysafecard reçu et confirmé. La préparation de ton colis est en cours — tu recevras une mise à jour dès la mise en expédition.\n\nTon token de suivi TRK_ t'a été envoyé en messagerie (message à sauvegarder).`
      : `Dépôt Monero reçu et confirmé. La préparation de ton colis est en cours — tu recevras une mise à jour dès la mise en expédition.\n\nTon token de suivi TRK_ t'a été envoyé en messagerie (message à sauvegarder).`,
  })

  // Token TRK en messagerie (fil discussion / trk_token) — débloque l'onglet En locker
  try {
    await sendTrkTokenMessage({
      orderId: thread.id,
      trackingToken: thread.trackingToken,
      customerName: thread.customerName,
      customerToken: thread.customerToken,
    })
  } catch (e) {
    console.error("[confirmDeposit] send TRK failed:", e)
  }

  await notifyCustomer(thread.customerToken, {
    title: `Paiement ${payLabel} confirmé — préparation`,
    body: "Paiement OK. Token TRK_ disponible en messagerie pour le suivi Locker.",
    url: "/",
    tag: `prep-${threadId}`,
  }).catch(() => {})

  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true as const }
}

// Supprime définitivement une commande (et ses messages, via cascade applicative).
export async function deleteOrderThread(threadId: number) {
  if (!threadId) return { ok: false as const }
  await db.delete(threadMessages).where(eq(threadMessages.threadId, threadId))
  await db.delete(orderThreads).where(eq(orderThreads.id, threadId))
  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true as const }
}

// ─── Génération de commande par l'admin depuis la messagerie ────────────────
export type AdminOrderItem = {
  productId: number
  title: string
  qty: number      // nombre de packs commandés
  price: number    // prix unitaire du conditionnement choisi
}

export type AdminOrderPromo = {
  /** Code affiché dans le récap (optionnel) */
  code?: string
  type: "percent" | "fixed" | "produit"
  value: number
  minAmount: number
  /** Requis si type = produit */
  productName?: string | null
}

export type AdminOrderInput = {
  // Contexte client (issu du fil de discussion sélectionné)
  customerName: string
  customerToken: string | null
  // Articles
  items: AdminOrderItem[]
  // Mode de livraison
  fulfillment: "livraison" | "meetup" | "locker"
  // Livraison domicile
  address?: string
  deliveryFee?: number
  deliveryDate?: string  // "2026-07-19" — même logique que meet-up
  deliverySlot?: string  // "Lundi 18h-20h"
  // Meetup
  meetupDate?: string    // "2026-07-19"
  meetupSlot?: string    // "Dimanche 22h"
  // Locker
  lockerAddress?: string
  /** Promo manuelle ou issue d'un code existant (même modèle panier) */
  promo?: AdminOrderPromo | null
}

export async function adminCreateOrder(input: AdminOrderInput) {
  if (!input.items.length) return { ok: false as const, error: "Aucun article." }

  const { computePromoDiscount } = await import("@/lib/promo-calc")

  const subtotal = input.items.reduce((s, i) => s + i.qty * i.price, 0)
  const fee = input.fulfillment === "livraison" ? (input.deliveryFee ?? 0) : input.fulfillment === "locker" ? 10 : 0
  const promo = input.promo ?? null
  const promoDiscount = computePromoDiscount(input.items, subtotal, promo)
  if (promo && promo.minAmount > 0 && subtotal < promo.minAmount) {
    return {
      ok: false as const,
      error: `Minimum d'achat non atteint pour la promo (min. ${promo.minAmount}€, panier ${subtotal}€).`,
    }
  }
  if (promo?.type === "produit" && promoDiscount === 0) {
    return {
      ok: false as const,
      error: `Produit offert introuvable dans la commande (attendu : ${promo.productName ?? "—"}).`,
    }
  }
  const total = Math.max(0, subtotal + fee - promoDiscount)

  const lines = input.items.map((i) => `• ${i.qty}x ${i.title} — ${i.qty * i.price}€`).join("\n")
  const productsShort = input.items.map((i) => `${i.qty}x ${i.title}`).join(", ")

  let modeLine = ""
  let scheduledDate: string | null = null
  let scheduledSlot: string | null = null
  let address: string | null = null

  if (input.fulfillment === "meetup") {
    scheduledDate = input.meetupDate ?? null
    scheduledSlot = input.meetupSlot ?? null
    modeLine = `Retrait sur place (meet-up)${scheduledSlot ? ` à ${scheduledSlot}` : ""}`
  } else if (input.fulfillment === "locker") {
    address = input.lockerAddress ?? null
    modeLine = `Retrait en Locker Mondial Relay${address ? ` — ${address}` : ""} (frais 10€)`
  } else {
    // Livraison domicile : date + créneau (aligné checkout client)
    address = input.address ?? null
    scheduledDate = input.deliveryDate ?? null
    scheduledSlot = input.deliverySlot ?? null
    modeLine = `Livraison à ${address ?? "adresse non précisée"}${
      scheduledSlot ? ` — créneau ${scheduledSlot}` : ""
    }${fee > 0 ? ` (frais ${fee}€)` : ""}`
  }

  const promoLabel = promo
    ? promo.type === "percent"
      ? `-${promo.value}%`
      : promo.type === "produit"
        ? `${promo.value}× ${promo.productName ?? "produit"} offert`
        : `-${promo.value}€`
    : null

  const summary = [
    `Nouvelle commande de ${input.customerName}`,
    ``,
    lines,
    ``,
    scheduledDate ? `Date : ${scheduledDate}` : null,
    modeLine,
    ``,
    `Sous-total : ${subtotal}€`,
    fee > 0 ? `${input.fulfillment === "locker" ? "Locker" : "Livraison"} : ${fee}€` : null,
    promoDiscount > 0
      ? `Promo${promo?.code ? ` ${promo.code}` : ""}${promoLabel ? ` (${promoLabel})` : ""} : -${promoDiscount}€`
      : null,
    `TOTAL : ${total}€`,
  ].filter(Boolean).join("\n")

  // Décrémente le stock de chaque article
  for (const item of input.items) {
    await adjustStock(item.productId, -item.qty)
  }

  // Crée le fil de commande exactement comme si le client l'avait passé
  const result = await createOrderThread({
    customerName: input.customerName,
    customerToken: input.customerToken ?? undefined,
    summary,
    products: productsShort,
    productIds: input.items.map((i) => i.productId),
    total,
    promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
    fulfillment: input.fulfillment,
    address: address ?? undefined,
    scheduledDate: scheduledDate ?? undefined,
    scheduledSlot: scheduledSlot ?? undefined,
    paymentMethod: input.fulfillment === "locker" ? "xmr" : null,
  })

  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "Échec création commande." }
  }

  return {
    ok: true as const,
    id: result.id,
    trackingToken: result.trackingToken,
    total,
    promoDiscount,
  }
}

// Compte les fils "nouveau" (badge boîte de réception)
export async function countNewThreads() {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(and(eq(orderThreads.status, "en_attente")))
  return row?.c ?? 0
}
