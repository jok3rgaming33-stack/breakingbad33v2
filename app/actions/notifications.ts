"use server"

import { db } from "@/lib/db"
import {
  broadcastNotifications,
  users,
} from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { notifyCustomer, notifyAllClients } from "@/lib/push"

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

  // Payload push commun — même format que publishAndNotify des news
  const pushPayload = {
    title: `BreakingBad33 — ${title}`,
    body,
    url: "/",
    tag: `notif-${Date.now()}`,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
  }

  // Envoi push uniquement — même comportement que les news.
  // Pas de fil en messagerie : la notification arrive dans la cloche du navigateur.
  let sentCount = 0

  if (input.recipients === "all") {
    await notifyAllClients(pushPayload).catch(() => {})
    sentCount = targets.length
  } else {
    for (const t of targets) {
      try {
        await notifyCustomer(t.token, pushPayload)
        sentCount++
      } catch {
        // best-effort
      }
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
