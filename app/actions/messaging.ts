"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type NewOrderInput = {
  customerName: string
  customerToken?: string
  summary: string
  products?: string
  total: number
  fulfillment: "livraison" | "meetup"
  address?: string
  lat?: number | null
  lng?: number | null
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
      customerToken: input.customerToken?.trim() || null,
      summary: input.summary,
      products: input.products?.trim() || null,
      total: input.total,
      fulfillment: input.fulfillment,
      address: input.address?.trim() || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
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

// Vue client : ses fils filtrés par clé secrète (identifiant stable, multi-appareils)
export async function getThreadsForToken(customerToken: string) {
  const token = customerToken?.trim()
  if (!token) return []
  return db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.customerToken, token))
    .orderBy(desc(orderThreads.updatedAt))
}

// Aperçu léger pour les notifications client : statut + nombre de messages du vendeur.
// Permet de détecter à la fois un changement de statut ET un nouveau message vendeur.
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

// Supprime définitivement une commande (et ses messages, via cascade applicative).
export async function deleteOrderThread(threadId: number) {
  if (!threadId) return { ok: false as const }
  await db.delete(threadMessages).where(eq(threadMessages.threadId, threadId))
  await db.delete(orderThreads).where(eq(orderThreads.id, threadId))
  revalidatePath("/admin")
  revalidatePath("/messagerie")
  return { ok: true as const }
}

// Compte les fils "nouveau" (badge boîte de réception)
export async function countNewThreads() {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(and(eq(orderThreads.status, "en_attente")))
  return row?.c ?? 0
}
