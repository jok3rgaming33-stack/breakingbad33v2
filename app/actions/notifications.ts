"use server"

import { db } from "@/lib/db"
import {
  broadcastNotifications,
  orderThreads,
  threadMessages,
  users,
} from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"

export type NotificationRecipient = "all" | string[] // 'all' | tableau de tokens

export type BroadcastInput = {
  title: string
  body: string
  imageUrl?: string
  recipients: NotificationRecipient
}

// Envoie une notification dans la messagerie de chaque destinataire.
// Crée un fil "notification" distinct pour chaque client ciblé.
export async function sendBroadcastNotification(input: BroadcastInput) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }

  const title = input.title?.trim()
  const body = input.body?.trim()
  if (!title || !body) return { ok: false as const, error: "Titre et message requis." }

  // Récupère les destinataires
  let targets: { token: string; pseudo: string }[] = []

  if (input.recipients === "all") {
    const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
    targets = allUsers.map(u => ({ token: u.token, pseudo: u.pseudo ?? "Client" }))
  } else {
    const tokens = input.recipients as string[]
    const allUsers = await db.select({ token: users.token, pseudo: users.pseudo }).from(users)
    targets = allUsers
      .filter(u => tokens.includes(u.token))
      .map(u => ({ token: u.token, pseudo: u.pseudo ?? "Client" }))
  }

  if (!targets.length) return { ok: false as const, error: "Aucun destinataire trouvé." }

  // Crée un fil de notification par destinataire
  let sentCount = 0
  for (const t of targets) {
    try {
      const [thread] = await db
        .insert(orderThreads)
        .values({
          customerName: t.pseudo,
          customerToken: t.token,
          trackingToken: `NOTIF_${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
          summary: `Notification : ${title}`,
          total: 0,
          fulfillment: "livraison",
          status: "notification",
        })
        .returning()

      // Message vendeur = la notification elle-même
      const fullBody = input.imageUrl
        ? `${body}\n\n[image]${input.imageUrl}[/image]`
        : body

      await db.insert(threadMessages).values({
        threadId: thread.id,
        sender: "vendeur",
        body: fullBody,
      })

      sentCount++
    } catch {
      // best-effort : on continue si un destinataire échoue
    }
  }

  // Log en base
  await db.insert(broadcastNotifications).values({
    title,
    body,
    imageUrl: input.imageUrl ?? null,
    recipients: input.recipients === "all" ? "all" : JSON.stringify(input.recipients),
    sentCount,
  })

  revalidatePath("/admin")
  return { ok: true as const, sentCount }
}

// Historique des notifications envoyées
export async function listBroadcastNotifications(limit = 50) {
  return db
    .select()
    .from(broadcastNotifications)
    .orderBy(desc(broadcastNotifications.createdAt))
    .limit(limit)
}

export type BroadcastNotificationRow = Awaited<ReturnType<typeof listBroadcastNotifications>>[number]
