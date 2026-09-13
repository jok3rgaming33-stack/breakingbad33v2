"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { and, eq, sql, lt, or, isNull } from "drizzle-orm"
import { notifyCustomer } from "@/lib/push"
import { ensureFeatureSchema } from "@/lib/feature-schema"
import { clientThreadUrl } from "@/lib/deep-links"

const MAX_REMINDERS = 3
/** Première relance après 24 h, puis toutes les 24 h */
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Envoie des rappels automatiques pour les commandes Locker EN ATTENTE DE RETRAIT.
 * Uniquement si le statut est « Colis prêt à récupérer » (pret_meetup) :
 * pas pendant paiement / préparation / envoi.
 */
export async function processLockerReminders(): Promise<{ sent: number; checked: number }> {
  await ensureFeatureSchema()

  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_MS)

  let rows: (typeof orderThreads.$inferSelect)[] = []
  try {
    rows = await db
      .select()
      .from(orderThreads)
      .where(
        and(
          eq(orderThreads.fulfillment, "locker"),
          eq(orderThreads.status, "pret_meetup"),
          lt(orderThreads.updatedAt, cutoff),
          or(isNull(orderThreads.lockerLastReminderAt), lt(orderThreads.lockerLastReminderAt, cutoff)),
          sql`coalesce(${orderThreads.lockerReminderCount}, 0) < ${MAX_REMINDERS}`,
        ),
      )
      .limit(40)
  } catch (e) {
    console.error("[locker-reminders] select failed:", e)
    return { sent: 0, checked: 0 }
  }

  let sent = 0
  for (const thread of rows) {
    const count = Number(thread.lockerReminderCount ?? 0)
    if (count >= MAX_REMINDERS) continue

    const nextCount = count + 1
    const body =
      nextCount === 1
        ? `📦 Rappel : ta commande #${thread.id} (Locker) t'attend depuis plus de 24 h. Pense à la récupérer bientôt.`
        : nextCount === 2
          ? `⏰ 2ᵉ rappel : ta commande #${thread.id} est toujours en Locker. Récupère-la sous 24–48 h pour éviter tout souci.`
          : `⚠️ Dernier rappel : commande #${thread.id} en Locker depuis plusieurs jours. Contacte-nous si besoin via la messagerie.`

    try {
      await db.insert(threadMessages).values({
        threadId: thread.id,
        sender: "vendeur",
        body,
      })

      await db
        .update(orderThreads)
        .set({
          lockerReminderCount: nextCount,
          lockerLastReminderAt: new Date(),
          updatedAt: sql`now()`,
        })
        .where(eq(orderThreads.id, thread.id))

      await notifyCustomer(thread.customerToken, {
        title: `Locker — rappel commande #${thread.id}`,
        body,
        url: clientThreadUrl("locker", thread.id),
        tag: `locker-reminder-${thread.id}-${nextCount}`,
        threadId: thread.id,
        open: "locker",
      })

      sent += 1
    } catch (e) {
      console.error("[locker-reminders] thread", thread.id, e)
    }
  }

  return { sent, checked: rows.length }
}
