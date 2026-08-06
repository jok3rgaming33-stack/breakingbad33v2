"use server"

import { db } from "@/lib/db"
import {
  broadcastNotifications,
  notificationReads,
  orderThreads,
  threadMessages,
  users,
  type MediaAttachment,
} from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer } from "@/lib/push"

export type NotificationRecipient = "all" | string[] // 'all' | tableau de tokens

export type BroadcastInput = {
  title: string
  body: string
  /** @deprecated préférer media[] — conservé pour rétrocompat */
  imageUrl?: string
  media?: MediaAttachment[]
  recipients: NotificationRecipient
  // Origine absolue de l'app (ex: "https://monsite.com") passée par le client
  // pour construire une URL proxy absolue accessible par l'OS Android dans le payload push.
  appOrigin?: string
}

let schemaReady: Promise<void> | null = null

async function ensureNotificationSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        ALTER TABLE broadcast_notifications
        ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS notification_reads_notif_token_uidx
        ON notification_reads (notification_id, customer_token)
      `)
      // Colonnes optionnelles / NOT NULL qui cassent l'INSERT drizzle si absentes ou sans DEFAULT
      await db.execute(sql`
        ALTER TABLE order_threads
        ADD COLUMN IF NOT EXISTS product_ids JSONB NOT NULL DEFAULT '[]'::jsonb
      `)
      await db.execute(sql`
        ALTER TABLE order_threads
        ALTER COLUMN product_ids SET DEFAULT '[]'::jsonb
      `)
      await db.execute(sql`
        ALTER TABLE order_threads
        ADD COLUMN IF NOT EXISTS deposit_notified BOOLEAN NOT NULL DEFAULT false
      `)
      await db.execute(sql`
        ALTER TABLE order_threads
        ALTER COLUMN deposit_notified SET DEFAULT false
      `)
      await db.execute(sql`
        ALTER TABLE order_threads
        ADD COLUMN IF NOT EXISTS deposit_confirmed BOOLEAN NOT NULL DEFAULT false
      `)
      await db.execute(sql`
        ALTER TABLE order_threads
        ALTER COLUMN deposit_confirmed SET DEFAULT false
      `)
    })().catch((e) => {
      schemaReady = null
      console.error("[notifications] ensureNotificationSchema failed:", e)
      throw e
    })
  }
  await schemaReady
}

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    const any = e as Error & { cause?: unknown; detail?: string; code?: string }
    const parts = [e.message]
    if (any.detail) parts.push(String(any.detail))
    if (any.cause instanceof Error) parts.push(any.cause.message)
    else if (any.cause) parts.push(String(any.cause))
    return parts.filter(Boolean).join(" | ")
  }
  if (typeof e === "string") return e
  try {
    return JSON.stringify(e)
  } catch {
    return "erreur inconnue"
  }
}

function parseReturningId(result: unknown): number | null {
  const asAny = result as {
    rows?: { id?: number | string }[]
  } & { id?: number | string }[]
  const raw =
    (Array.isArray(asAny) ? asAny[0]?.id : undefined) ??
    asAny.rows?.[0]?.id ??
    null
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Insert fil notification (SQL minimal — sans colonnes payment_* du schéma drizzle). */
async function insertNotificationThread(input: {
  customerName: string
  customerToken: string
  trackingToken: string
  summary: string
}): Promise<number> {
  // Essai 1 : colonnes courantes (product_ids + deposit_*)
  try {
    const result = await db.execute(sql`
      INSERT INTO order_threads (
        customer_name,
        customer_token,
        tracking_token,
        summary,
        total,
        fulfillment,
        status,
        product_ids,
        deposit_notified,
        deposit_confirmed
      ) VALUES (
        ${input.customerName},
        ${input.customerToken},
        ${input.trackingToken},
        ${input.summary},
        0,
        'livraison',
        'notification',
        '[]'::jsonb,
        false,
        false
      )
      RETURNING id
    `)
    const id = parseReturningId(result)
    if (id != null) return id
  } catch (e) {
    console.error("[notifications] insert full cols failed, fallback minimal:", errMsg(e))
  }

  // Essai 2 : strict minimum (schéma historique)
  const result = await db.execute(sql`
    INSERT INTO order_threads (
      customer_name,
      customer_token,
      tracking_token,
      summary,
      total,
      fulfillment,
      status
    ) VALUES (
      ${input.customerName},
      ${input.customerToken},
      ${input.trackingToken},
      ${input.summary},
      0,
      'livraison',
      'notification'
    )
    RETURNING id
  `)
  const id = parseReturningId(result)
  if (id == null) {
    throw new Error(`INSERT order_threads sans id (retour: ${JSON.stringify(result).slice(0, 200)})`)
  }
  return id
}

function sanitizeMedia(media: MediaAttachment[] | null | undefined): MediaAttachment[] {
  if (!Array.isArray(media)) return []
  return media
    .filter((m) => m && (m.type === "image" || m.type === "video") && typeof m.url === "string" && m.url.trim())
    .map((m) => ({ type: m.type, url: m.url.trim() }))
}

function resolveMedia(row: { imageUrl?: string | null; media?: MediaAttachment[] | null }): MediaAttachment[] {
  const fromJson = sanitizeMedia(row.media ?? [])
  if (fromJson.length > 0) return fromJson
  const url = row.imageUrl?.trim()
  if (!url) return []
  const isVideo = /\.(mp4|mov|m4v|webm|quicktime)(\?|$)/i.test(url)
  return [{ type: isVideo ? "video" : "image", url }]
}

/** Corps messagerie : titre + message + balises média (image/vidéo). */
function buildThreadMessageBody(title: string, body: string, media: MediaAttachment[]): string {
  let full = `${title}\n\n${body}`
  for (const m of media) {
    if (m.type === "video") full += `\n\n[video]${m.url}[/video]`
    else full += `\n\n[image]${m.url}[/image]`
  }
  return full
}

/** Convertit une URL Blob privée en URL proxy absolue fetchable sans token (par le SW / l'OS). */
function toAbsoluteProxyUrl(blobUrl: string, origin: string): string {
  if (!blobUrl.includes(".blob.vercel-storage.com")) return blobUrl
  return `${origin}/api/media?url=${encodeURIComponent(blobUrl)}`
}

// Envoie une notification dans la messagerie (Discussions) de chaque destinataire + push.
// Crée un fil status "notification" distinct par client (affiché onglet Discussions, pas Commandes).
export async function sendBroadcastNotification(input: BroadcastInput) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }

  try {
    await ensureNotificationSchema()
  } catch (e) {
    console.error("[notifications] schema:", e)
    return { ok: false as const, error: `Schéma DB : ${errMsg(e)}` }
  }

  const title = input.title?.trim()
  const body = input.body?.trim()
  if (!title || !body) return { ok: false as const, error: "Titre et message requis." }

  let media = sanitizeMedia(input.media)
  if (media.length === 0 && input.imageUrl?.trim()) {
    media = resolveMedia({ imageUrl: input.imageUrl, media: [] })
  }
  // Push OS : première image uniquement (les vidéos ne sont pas supportées nativement).
  const pushImageSource = media.find((m) => m.type === "image")?.url ?? null

  // Récupère les destinataires
  let targets: { token: string; pseudo: string }[] = []

  try {
    if (input.recipients === "all") {
      const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
      targets = allUsers
        .filter((u) => !!u.token?.trim())
        .map((u) => ({ token: u.token, pseudo: (u.pseudo ?? "Client").trim() || "Client" }))
    } else {
      const tokens = (input.recipients as string[]).map((t) => String(t).trim()).filter(Boolean)
      if (!tokens.length) return { ok: false as const, error: "Aucun destinataire sélectionné." }
      const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
      const tokenSet = new Set(tokens)
      targets = allUsers
        .filter((u) => u.token && tokenSet.has(u.token))
        .map((u) => ({ token: u.token, pseudo: (u.pseudo ?? "Client").trim() || "Client" }))
      // Si tokens admin non présents en table users (ex. collés manuellement), on livre quand même
      if (targets.length === 0 && tokens.length > 0) {
        targets = tokens.map((token, i) => ({ token, pseudo: `Client ${i + 1}` }))
      }
    }
  } catch (e) {
    console.error("[notifications] load targets:", e)
    return { ok: false as const, error: `Lecture clients : ${errMsg(e)}` }
  }

  if (!targets.length) {
    return {
      ok: false as const,
      error: "Aucun destinataire trouvé (table utilisateurs vide ?).",
    }
  }

  // Insère le log en base AVANT l'envoi pour récupérer l'ID à injecter dans le payload.
  let notificationId: number
  try {
    const [inserted] = await db
      .insert(broadcastNotifications)
      .values({
        title,
        body,
        imageUrl: pushImageSource,
        media,
        recipients: input.recipients === "all" ? "all" : JSON.stringify(input.recipients),
        sentCount: 0,
      })
      .returning()
    if (!inserted?.id) return { ok: false as const, error: "Impossible de créer le log de notification." }
    notificationId = inserted.id
  } catch (e) {
    console.error("[notifications] insert log:", e)
    return { ok: false as const, error: `Log notification : ${errMsg(e)}` }
  }

  // L'image dans le payload push doit être une URL absolue publiquement accessible
  // (l'OS Android la fetche sans token). On passe par notre proxy /api/media.
  const pushImageUrl =
    pushImageSource && input.appOrigin
      ? toAbsoluteProxyUrl(pushImageSource, input.appOrigin)
      : pushImageSource ?? undefined

  const messageBody = buildThreadMessageBody(title, body, media)
  let sentCount = 0
  let firstError: string | null = null

  // Lots pour limiter la charge (timeout Vercel) tout en livrant tout le monde
  const BATCH = 25
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          const short = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
          const trackingToken = `NOTIF_${notificationId}_${short}`

          const threadId = await insertNotificationThread({
            customerName: t.pseudo.slice(0, 200),
            customerToken: t.token,
            trackingToken,
            summary: `Notification : ${title}`.slice(0, 500),
          })

          await db.insert(threadMessages).values({
            threadId,
            sender: "vendeur",
            body: messageBody,
          })

          // Push OS best-effort (n'empêche pas le comptage messagerie)
          await notifyCustomer(t.token, {
            title: `BreakingBad33 — ${title}`,
            body,
            url: "/",
            tag: `notif-${notificationId}`,
            notificationId,
            customerToken: t.token,
            ...(pushImageUrl ? { image: pushImageUrl } : {}),
          }).catch(() => {})

          return { ok: true as const }
        } catch (e) {
          const msg = errMsg(e)
          console.error("[notifications] deliver fail:", t.token?.slice(0, 8), msg)
          return { ok: false as const, error: msg }
        }
      }),
    )

    for (const r of results) {
      if (r.ok) sentCount++
      else if (!firstError) firstError = r.error
    }
  }

  try {
    await db
      .update(broadcastNotifications)
      .set({ sentCount })
      .where(eq(broadcastNotifications.id, notificationId))
  } catch (e) {
    console.error("[notifications] update sentCount:", e)
  }

  try {
    revalidatePath("/admin")
    revalidatePath("/")
  } catch {
    /* ignore */
  }

  if (sentCount === 0) {
    return {
      ok: false as const,
      error: firstError
        ? `Aucun client livré (${targets.length} ciblé(s)). ${firstError}`
        : `Aucun client livré (${targets.length} ciblé(s)).`,
      sentCount: 0,
      targetCount: targets.length,
    }
  }

  return {
    ok: true as const,
    sentCount,
    targetCount: targets.length,
    partialError: firstError && sentCount < targets.length ? firstError : undefined,
  }
}

// Historique des notifications envoyées
export async function listBroadcastNotifications(limit = 50) {
  await ensureNotificationSchema()
  const rows = await db
    .select()
    .from(broadcastNotifications)
    .orderBy(desc(broadcastNotifications.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    media: resolveMedia(r),
    imageUrl: resolveMedia(r).find((m) => m.type === "image")?.url ?? r.imageUrl,
  }))
}

export type BroadcastNotificationRow = Awaited<ReturnType<typeof listBroadcastNotifications>>[number]

// Enregistre la lecture d'une notification par un client (SW push ou ouverture du fil messagerie).
export async function markNotificationRead(notificationId: number, customerToken: string) {
  if (!notificationId || !customerToken) return { ok: false as const }
  await ensureNotificationSchema()
  await db
    .insert(notificationReads)
    .values({ notificationId, customerToken })
    .onConflictDoNothing()
  return { ok: true as const }
}

// Retourne le détail de lecture d'une notification (qui a lu, qui n'a pas lu).
export async function getNotificationReads(notificationId: number) {
  const reads = await db
    .select({ customerToken: notificationReads.customerToken, readAt: notificationReads.readAt })
    .from(notificationReads)
    .where(eq(notificationReads.notificationId, notificationId))
  return reads
}

// Retourne le nombre de lectures par notification (pour affichage rapide dans la liste).
export async function getNotificationReadCounts() {
  const rows = await db
    .select({
      notificationId: notificationReads.notificationId,
      readCount: sql<number>`count(*)::int`,
    })
    .from(notificationReads)
    .groupBy(notificationReads.notificationId)
  return Object.fromEntries(rows.map((r) => [r.notificationId, r.readCount]))
}
