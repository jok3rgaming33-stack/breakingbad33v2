"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type NewOrderInput = {
  customerName: string
  summary: string
  total: number
  fulfillment: "livraison" | "meetup"
  scheduledDate?: string
  scheduledSlot?: string
}

// Crée un fil de commande + le message initial du client (appelé à la validation du panier)
export async function createOrderThread(input: NewOrderInput) {
  const name = input.customerName?.trim() || "Client"
  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: name,
      summary: input.summary,
      total: input.total,
      fulfillment: input.fulfillment,
      scheduledDate: input.scheduledDate ?? null,
      scheduledSlot: input.scheduledSlot ?? null,
      status: "en_attente",
    })
    .returning()

  await db.insert(threadMessages).values({
    threadId: thread.id,
    sender: "client",
    body: input.summary,
  })

  revalidatePath("/messagerie")
  return { id: thread.id }
}

// Boîte de réception vendeur : tous les fils avec aperçu du dernier message
export async function getThreads() {
  const threads = await db.select().from(orderThreads).orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Détail d'un fil avec tous ses messages (ordre chronologique)
export async function getThread(id: number) {
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, id))
  if (!thread) return null
  const messages = await db
    .select()
    .from(threadMessages)
    .where(eq(threadMessages.threadId, id))
    .orderBy(threadMessages.createdAt)
  return { thread, messages }
}

// Ajoute un message dans un fil (vendeur ou client)
export async function addMessage(threadId: number, sender: "client" | "vendeur", body: string) {
  const text = body?.trim()
  if (!text) return { ok: false }

  await db.insert(threadMessages).values({ threadId, sender, body: text })
  // Le statut reste un choix délibéré du vendeur : on ne met à jour que la date.
  await db
    .update(orderThreads)
    .set({ updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))

  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  return { ok: true }
}

// Met à jour le statut d'un fil (nouveau / en cours / traité)
export async function updateThreadStatus(threadId: number, status: string) {
  await db
    .update(orderThreads)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))
  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  return { ok: true }
}

// Vue client : ses fils filtrés par pseudo
export async function getThreadsForCustomer(customerName: string) {
  const name = customerName?.trim()
  if (!name) return []
  return db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.customerName, name))
    .orderBy(desc(orderThreads.updatedAt))
}

// Compte les fils "nouveau" (badge boîte de réception)
export async function countNewThreads() {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(and(eq(orderThreads.status, "en_attente")))
  return row?.c ?? 0
}
