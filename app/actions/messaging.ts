"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { normalizeStatus, statusMeta } from "@/lib/order-status"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { notifyCustomer, notifyVendor } from "@/lib/push"

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

  // Notifie le vendeur de l'arrivée d'une nouvelle commande.
  await notifyVendor({
    title: "Nouvelle commande",
    body: `${name} vient de passer une commande (#${thread.id}).`,
    url: "/admin",
    tag: `order-${thread.id}`,
  })

  revalidatePath("/messagerie")
  return { id: thread.id }
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
    url: "/admin",
    tag: `thread-${thread.id}`,
  })

  revalidatePath("/messagerie")
  revalidatePath("/admin")
  return { ok: true as const, id: thread.id }
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

  // Notification push à l'autre partie.
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (thread) {
    const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text
    if (sender === "vendeur") {
      // Message du vendeur → on prévient le client.
      await notifyCustomer(thread.customerToken, {
        title: "Nouveau message du vendeur",
        body: preview,
        url: "/",
        tag: `thread-${threadId}`,
      })
    } else {
      // Message du client → on prévient le vendeur.
      await notifyVendor({
        title: `Message de ${thread.customerName}`,
        body: preview,
        url: "/admin",
        tag: `thread-${threadId}`,
      })
    }
  }

  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  return { ok: true }
}

// Met à jour le statut d'un fil et envoie automatiquement un message au client
// décrivant le nouveau statut (une fois par transition). Pour "livree", c'est aussi
// le moment où les points de fidélité sont considérés comme crédités (voir getCustomerStats).
// Pour "annulee", un motif facultatif saisi par l'admin est inclus dans le message.
export async function updateThreadStatus(threadId: number, status: string, reason?: string) {
  const [current] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!current) return { ok: false }

  const prevKey = normalizeStatus(current.status)
  const nextKey = normalizeStatus(status)

  await db
    .update(orderThreads)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(orderThreads.id, threadId))

  // Message automatique au client, uniquement quand le statut change réellement.
  if (nextKey !== prevKey) {
    let body: string | null = null
    switch (nextKey) {
      case "validee":
        body = "Ta commande a été validée."
        break
      case "preparation":
        body = "Nous sommes en train de préparer tes articles."
        break
      case "livraison":
        body = "Le livreur est en route, reste joignable."
        break
      case "livree": {
        const mode = current.fulfillment === "meetup" ? "en meet-up" : "en livraison"
        const points = computeLoyaltyPoints(current.total ?? 0)
        body =
          `Ta commande t'a bien été livrée (${mode}). Merci pour ta confiance !` +
          (points > 0 ? ` ${points} point${points > 1 ? "s" : ""} de fidélité viennent d'être crédités sur ton compte.` : "")
        break
      }
      case "annulee": {
        const motif = reason?.trim()
        body = motif
          ? `Ta commande a été annulée. Motif : ${motif}`
          : "Ta commande a été annulée."
        break
      }
    }
    if (body) {
      await db.insert(threadMessages).values({ threadId, sender: "vendeur", body })
      // Notifie le client du changement de statut de sa commande.
      await notifyCustomer(current.customerToken, {
        title: `Commande #${threadId} — ${statusMeta(nextKey).label}`,
        body,
        url: "/",
        tag: `status-${threadId}`,
      })
    }
  }

  revalidatePath("/messagerie")
  revalidatePath(`/messagerie/${threadId}`)
  revalidatePath("/admin")
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
