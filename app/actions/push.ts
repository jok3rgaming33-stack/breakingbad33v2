"use server"

import { db } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export type PushSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  role: "client" | "vendeur"
  customerToken?: string | null
}

// Enregistre (ou met à jour) un abonnement push pour un client ou le vendeur.
export async function savePushSubscription(input: PushSubscriptionInput) {
  if (!input.endpoint || !input.p256dh || !input.auth) return { ok: false as const }

  const role = input.role === "vendeur" ? "vendeur" : "client"
  const customerToken = role === "client" ? input.customerToken?.trim() || null : null

  // L'endpoint est unique : on remplace les infos si l'abonnement existe déjà.
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      role,
      customerToken,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: input.p256dh, auth: input.auth, role, customerToken },
    })

  return { ok: true as const }
}

// Supprime un abonnement (désactivation des notifications sur cet appareil).
export async function removePushSubscription(endpoint: string) {
  if (!endpoint) return { ok: false as const }
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  return { ok: true as const }
}

// Indique si un endpoint donné est déjà abonné (pour l'état du bouton).
export async function isPushSubscribed(endpoint: string) {
  if (!endpoint) return false
  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1)
  return !!row
}
