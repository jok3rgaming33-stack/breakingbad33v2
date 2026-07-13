"use server"

import { db } from "@/lib/db"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { and, desc, eq, gt, isNull, ne, notInArray, or, sql } from "drizzle-orm"
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
  // Montant de la remise appliquée (promo ou fidélité). Stocké pour calculer
  // les points sur le total net et informer le client dans le message de livraison.
  promoDiscount?: number
  fulfillment: "livraison" | "meetup" | "locker"
  address?: string
  lat?: number | null
  lng?: number | null
  scheduledDate?: string
  scheduledSlot?: string
}

// Crée un fil de commande + génère le token de suivi + envoie le message initial au client
export async function createOrderThread(input: NewOrderInput) {
  const name = input.customerName?.trim() || "Client"
  // Génère un token de suivi unique : "TRK_" + 16 caractères aléatoires
  const trackingToken = `TRK_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
  
  const [thread] = await db
    .insert(orderThreads)
    .values({
      customerName: name,
      customerToken: input.customerToken?.trim() || null,
      trackingToken,
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

  // Message initial du client (résumé de la commande)
  await db.insert(threadMessages).values({
    threadId: thread.id,
    sender: "client",
    body: input.summary,
  })

  if (input.fulfillment === "locker") {
    // Pour les commandes locker : on crée un fil séparé dans la messagerie normale
    // contenant UNIQUEMENT le token TRK — visible une seule fois puis supprimé.
    const trkBody = [
      `⚠️ ATTENTION — LIS CE MESSAGE ATTENTIVEMENT ⚠️`,
      ``,
      `Ton token de suivi Locker est :`,
      ``,
      `${trackingToken}`,
      ``,
      `SAUVEGARDE CE TOKEN MAINTENANT.`,
      `Ce message sera automatiquement supprimé une fois que tu l'auras ouvert, pour des raisons de sécurité.`,
      `Sans ce token tu ne pourras plus accéder au suivi de ta commande.`,
    ].join("\n")

    const [trkThread] = await db
      .insert(orderThreads)
      .values({
        customerName: name,
        customerToken: input.customerToken?.trim() || null,
        trackingToken: `TRK_MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        summary: `Token de suivi — Commande #${thread.id}`,
        total: 0,
        fulfillment: "locker",
        status: "trk_token", // statut spécial : message TRK à lire une fois
      })
      .returning()

    await db.insert(threadMessages).values({
      threadId: trkThread.id,
      sender: "vendeur",
      body: trkBody,
    })

    // Notifie le client : il doit ouvrir la messagerie pour sauvegarder son token
    await notifyCustomer(input.customerToken?.trim() || null, {
      title: "Token de suivi Locker — A SAUVEGARDER",
      body: "Ouvre la messagerie maintenant pour récupérer ton token de suivi. Il sera supprimé après lecture.",
      url: "/",
      tag: `trk-${thread.id}`,
    })
  } else {
    // Commandes non-locker : message de confirmation classique dans le fil de commande
    await db.insert(threadMessages).values({
      threadId: thread.id,
      sender: "vendeur",
      body: `Merci pour ta commande ! Elle a bien été prise en compte. Tu recevras une mise à jour dès qu'elle sera traitée.`,
    })
  }

  // Notifie le vendeur de l'arrivée d'une nouvelle commande.
  await notifyVendor({
    title: "Nouvelle commande",
    body: `${name} vient de passer une commande (#${thread.id})${input.fulfillment === "locker" ? " — LOCKER" : ""}.`,
    url: "/admin",
    tag: `order-${thread.id}`,
  })

  revalidatePath("/messagerie")
  revalidatePath("/admin")
  return { id: thread.id, trackingToken }
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
    url: "/admin",
    tag: `thread-${thread.id}`,
  })

  revalidatePath("/messagerie")
  revalidatePath("/admin")
  return { ok: true as const, id: thread.id }
}

// Tous les fils (usage interne)
export async function getThreads() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(ne(orderThreads.status, "notification"))
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Commandes actives hors locker : tout sauf "livree", "annulee", "discussion" et fulfillment locker
export async function getActiveOrders() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(
      and(
        notInArray(orderThreads.status, ["livree", "annulee", "discussion", "notification"]),
        ne(orderThreads.fulfillment, "locker"),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Commandes Locker Mondial Relay actives (non livrees, non annulees, hors fils TRK internes)
export async function getLockerOrders() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(
      and(
        eq(orderThreads.fulfillment, "locker"),
        notInArray(orderThreads.status, ["livree", "annulee", "trk_token"]),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
  return threads
}

// Commandes clôturées (livree ou annulee), toutes livraisons confondues
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
        ne(orderThreads.status, "trk_token"),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Discussions directes uniquement (pas des commandes)
export async function getDiscussions() {
  const threads = await db
    .select()
    .from(orderThreads)
    .where(eq(orderThreads.status, "discussion"))
    .orderBy(desc(orderThreads.updatedAt))
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

// Met à jour le statut d'un fil et envoie automatiquement un message au client avec les infos à jour.
// Optionnellement met à jour le numéro Colissimo quand la commande est expédiée.
// Pour "livree", c'est aussi le moment où les points de fidélité sont crédités (voir getCustomerStats).
// Pour "annulee", un motif facultatif saisi par l'admin est inclus dans le message.
export async function updateThreadStatus(
  threadId: number,
  status: string,
  reason?: string,
  colissimoNumber?: string
) {
  const [current] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!current) return { ok: false }

  const prevKey = normalizeStatus(current.status)
  const nextKey = normalizeStatus(status)

  // Mise à jour du statut et optionnellement du numéro Colissimo
  const updateData: any = { status, updatedAt: sql`now()` }
  if (colissimoNumber?.trim()) {
    updateData.colissimoNumber = colissimoNumber.trim()
  }

  await db
    .update(orderThreads)
    .set(updateData)
    .where(eq(orderThreads.id, threadId))

  // Message automatique au client, uniquement quand le statut change réellement.
  if (nextKey !== prevKey) {
    let body: string | null = null
    switch (nextKey) {
      case "validee":
        body = "✅ Ta commande a été validée et prise en charge."
        break
      case "preparation":
        body = "⚙️ Nous sommes en train de préparer tes articles."
        break
      case "livraison": {
        // Inclure le numéro de suivi Colissimo s'il existe
        const colNum = current.colissimoNumber || colissimoNumber
        body = colNum
          ? `📦 C'est parti ! Le livreur est en route.\nNuméro de suivi : ${colNum}\nReste joignable.`
          : "📦 Le livreur est en route. Reste joignable."
        break
      }
      case "livree": {
        const mode = current.fulfillment === "meetup" ? "en meet-up" : current.fulfillment === "locker" ? "en Locker Mondial Relay" : "en livraison"
        const points = computeLoyaltyPoints(current.total ?? 0)
        body =
          `✨ Ta commande t'a bien été livrée (${mode}). Merci pour ta confiance !` +
          (points > 0 ? `\n${points} point${points > 1 ? "s" : ""} de fidélité viennent d'être crédités.` : "")
        break
      }
      case "annulee": {
        const motif = reason?.trim()
        body = motif
          ? `❌ Ta commande a été annulée.\nMotif : ${motif}`
          : "❌ Ta commande a été annulée."
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

// Vue client "Mes commandes" onglet "En cours" :
// - commandes non-locker (toutes)
// - fils trk_token (locker) : alerte ambre "token à sauvegarder"
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
        ne(orderThreads.status, "notification"),            // les notifs broadcast passent par la cloche, pas la messagerie
        or(
          ne(orderThreads.fulfillment, "locker"),            // commandes normales
          eq(orderThreads.status, "trk_token"),             // fils TRK locker à afficher en ambre
        ),
      )
    )
    .orderBy(desc(orderThreads.updatedAt))
}

// Marque un fil comme lu par le client :
// - met à jour clientLastSeen sur le thread
// - horodate clientReadAt sur tous les messages vendeur non encore lus (visible admin uniquement)
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

// Retourne le nombre de fils non lus par section :
// - messaging : fils hors locker (hors trk_token) avec updated_at > clientLastSeen
// - orders    : fils locker + trk_token avec updated_at > clientLastSeen
export async function getUnreadCounts(customerToken: string): Promise<{ messaging: number; orders: number }> {
  const token = customerToken?.trim()
  if (!token) return { messaging: 0, orders: 0 }

  const rows = await db
    .select({
      fulfillment: orderThreads.fulfillment,
      status: orderThreads.status,
      updatedAt: orderThreads.updatedAt,
      clientLastSeen: orderThreads.clientLastSeen,
    })
    .from(orderThreads)
    .where(eq(orderThreads.customerToken, token))

  let messaging = 0
  let orders = 0

  for (const r of rows) {
    const isUnread = !r.clientLastSeen || r.updatedAt > r.clientLastSeen
    if (!isUnread) continue
    if (r.status === "trk_token" || r.fulfillment === "locker") {
      orders++
    } else {
      messaging++
    }
  }

  return { messaging, orders }
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
    .where(
      and(
        eq(orderThreads.customerToken, token),
        ne(orderThreads.status, "notification"),
      )
    )
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

  await db.update(orderThreads).set({ xmrWallet: w, updatedAt: sql`now()` }).where(eq(orderThreads.id, threadId))

  // Récupérer le taux XMR/EUR en temps réel pour indiquer le montant exact au client
  let xmrAmount: string | null = null
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=eur", { next: { revalidate: 60 } })
    const data = await res.json()
    const rate: number = data?.monero?.eur
    if (rate && thread.total) {
      const amount = (thread.total / rate).toFixed(6)
      xmrAmount = amount
    }
  } catch { /* taux indisponible — on n'affiche pas */ }

  const walletMsg = [
    `Commande validee ! Voici l'adresse du wallet Monero (XMR) ou effectuer ton depot :`,
    ``,
    `[ ${w} ]`,
    ``,
    xmrAmount
      ? `Montant a envoyer : ${xmrAmount} XMR (= ${thread.total}€ au taux actuel)`
      : `Montant a envoyer : l'equivalent de ${thread.total}€ en XMR (verifie le taux sur Kraken ou Binance).`,
    ``,
    `IMPORTANT : recopie cette adresse avec la plus grande attention, caractere par caractere.`,
    `Une seule erreur de saisie et le depot sera perdu definitivement — Monero est une crypto intraçable.`,
    ``,
    `Une fois le depot effectue, clique sur le bouton "J'ai effectue mon depot" dans ton suivi locker.`,
    `La preparation de ta commande demarrera a reception de la confirmation.`,
  ].join("\n")

  await db.insert(threadMessages).values({ threadId, sender: "vendeur", body: walletMsg })
  await db.update(orderThreads).set({ status: "validee", updatedAt: sql`now()` }).where(eq(orderThreads.id, threadId))

  await notifyCustomer(thread.customerToken, {
    title: "Adresse de paiement XMR disponible",
    body: "Ouvre ton suivi locker pour voir l'adresse de depot Monero.",
    url: "/",
    tag: `xmr-${threadId}`,
  })

  revalidatePath("/admin")
  return { ok: true as const }
}

// Client : signale que son depot XMR est effectue.
export async function notifyDeposit(threadId: number) {
  if (!threadId) return { ok: false as const }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const }

  await db.update(orderThreads).set({ depositNotified: true, updatedAt: sql`now()` }).where(eq(orderThreads.id, threadId))
  await db.insert(threadMessages).values({
    threadId,
    sender: "client",
    body: "J'ai effectue mon depot XMR. Merci de verifier la reception.",
  })

  await notifyVendor({
    title: `Depot XMR signale — Commande #${threadId}`,
    body: `${thread.customerName} signale avoir effectue son depot Monero.`,
    url: "/admin",
    tag: `deposit-${threadId}`,
  })

  revalidatePath("/admin")
  return { ok: true as const }
}

// Admin : confirme la reception du depot XMR et lance la preparation.
export async function confirmDeposit(threadId: number) {
  if (!threadId) return { ok: false as const }
  const [thread] = await db.select().from(orderThreads).where(eq(orderThreads.id, threadId))
  if (!thread) return { ok: false as const }

  await db.update(orderThreads).set({ depositConfirmed: true, status: "preparation", updatedAt: sql`now()` }).where(eq(orderThreads.id, threadId))
  await db.insert(threadMessages).values({
    threadId,
    sender: "vendeur",
    body: "Depot Monero recu et confirme. La preparation de ton colis est en cours — tu recevras une mise a jour des la mise en expedition.",
  })

  await notifyCustomer(thread.customerToken, {
    title: "Depot recu — preparation en cours",
    body: "Ton depot XMR a ete confirme. Ton colis est en preparation.",
    url: "/",
    tag: `prep-${threadId}`,
  })

  revalidatePath("/admin")
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

// Compte les fils "nouveau" (badge boîte de réception)
export async function countNewThreads() {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orderThreads)
    .where(and(eq(orderThreads.status, "en_attente")))
  return row?.c ?? 0
}
