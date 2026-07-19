"use server"

import { db } from "@/lib/db"
import {
  broadcastNotifications,
  notificationReads,
  users,
} from "@/lib/db/schema"
import { desc, eq, sql } from "drizzle-orm"
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

  // Insère le log en base AVANT l'envoi pour récupérer l'ID à injecter dans le payload.
  const [inserted] = await db.insert(broadcastNotifications).values({
    title,
    body,
    imageUrl: input.imageUrl ?? null,
    recipients: input.recipients === "all" ? "all" : JSON.stringify(input.recipients),
    sentCount: 0, // mis à jour après l'envoi
  }).returning()

  const notificationId = inserted.id

  // Envoi push uniquement — même comportement que les news.
  // notificationId + customerToken sont injectés pour que le SW pinge /api/notification-read.
  let sentCount = 0

  if (input.recipients === "all") {
    // Pour "all" on envoie un push par abonnement avec le customerToken individuel
    for (const t of targets) {
      const payload = {
        title: `BreakingBad33 — ${title}`,
        body,
        url: "/",
        tag: `notif-${notificationId}`,
        notificationId,
        customerToken: t.token,
        ...(input.imageUrl ? { image: input.imageUrl } : {}),
      }
      await notifyCustomer(t.token, payload).catch(() => {})
      sentCount++
    }
  } else {
    for (const t of targets) {
      try {
        const payload = {
          title: `BreakingBad33 — ${title}`,
          body,
          url: "/",
          tag: `notif-${notificationId}`,
          notificationId,
          customerToken: t.token,
          ...(input.imageUrl ? { image: input.imageUrl } : {}),
        }
        await notifyCustomer(t.token, payload)
        sentCount++
      } catch {
        // best-effort
      }
    }
  }

  // Met à jour le sentCount réel
  await db.update(broadcastNotifications)
    .set({ sentCount })
    .where(eq(broadcastNotifications.id, notificationId))

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
  return Object.fromEntries(rows.map(r => [r.notificationId, r.readCount]))
}
