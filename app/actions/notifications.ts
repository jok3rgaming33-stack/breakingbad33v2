"use server"

import { db } from "@/lib/db"
import {
  broadcastNotifications,
  notificationReads,
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
    })().catch((e) => {
      schemaReady = null
      console.error("[notifications] ensureNotificationSchema failed:", e)
    })
  }
  await schemaReady
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

/** Convertit une URL Blob privée en URL proxy absolue fetchable sans token (par le SW / l'OS). */
function toAbsoluteProxyUrl(blobUrl: string, origin: string): string {
  if (!blobUrl.includes(".blob.vercel-storage.com")) return blobUrl
  return `${origin}/api/media?url=${encodeURIComponent(blobUrl)}`
}

// Envoie une notification dans la messagerie de chaque destinataire.
// Crée un fil "notification" distinct pour chaque client ciblé.
export async function sendBroadcastNotification(input: BroadcastInput) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await ensureNotificationSchema()

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

  if (input.recipients === "all") {
    const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
    targets = allUsers.map((u) => ({ token: u.token, pseudo: u.pseudo ?? "Client" }))
  } else {
    const tokens = input.recipients as string[]
    const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
    targets = allUsers
      .filter((u) => tokens.includes(u.token))
      .map((u) => ({ token: u.token, pseudo: u.pseudo ?? "Client" }))
  }

  if (!targets.length) return { ok: false as const, error: "Aucun destinataire trouvé." }

  // Insère le log en base AVANT l'envoi pour récupérer l'ID à injecter dans le payload.
  const [inserted] = await db
    .insert(broadcastNotifications)
    .values({
      title,
      body,
      imageUrl: pushImageSource,
      media,
      recipients: input.recipients === "all" ? "all" : JSON.stringify(input.recipients),
      sentCount: 0, // mis à jour après l'envoi
    })
    .returning()

  const notificationId = inserted.id

  // L'image dans le payload push doit être une URL absolue publiquement accessible
  // (l'OS Android la fetche sans token). On passe par notre proxy /api/media.
  const pushImageUrl =
    pushImageSource && input.appOrigin
      ? toAbsoluteProxyUrl(pushImageSource, input.appOrigin)
      : pushImageSource ?? undefined

  let sentCount = 0

  for (const t of targets) {
    try {
      const payload = {
        title: `BreakingBad33 — ${title}`,
        body,
        url: "/",
        tag: `notif-${notificationId}`,
        notificationId,
        customerToken: t.token,
        ...(pushImageUrl ? { image: pushImageUrl } : {}),
      }
      await notifyCustomer(t.token, payload)
      sentCount++
    } catch {
      // best-effort
    }
  }

  // Met à jour le sentCount réel
  await db
    .update(broadcastNotifications)
    .set({ sentCount })
    .where(eq(broadcastNotifications.id, notificationId))

  revalidatePath("/admin")
  return { ok: true as const, sentCount }
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

// Enregistre la lecture d'une notification par un client (appelé depuis le SW via /api/notification-read).
export async function markNotificationRead(notificationId: number, customerToken: string) {
  if (!notificationId || !customerToken) return { ok: false as const }
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
