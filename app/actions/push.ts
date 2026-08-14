"use server"

import { db } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export type PushRole = "client" | "vendeur" | "both"

export type PushSubscriptionInput = {
  endpoint: string
  p256dh: string
  auth: string
  role: "client" | "vendeur"
  customerToken?: string | null
}

function mergePushRole(existing: string | undefined, incoming: "client" | "vendeur"): PushRole {
  if (!existing) return incoming
  if (existing === "both") return "both"
  if (existing === incoming) return incoming
  if (existing === "client" || existing === "vendeur") return "both"
  return incoming
}

// Enregistre (ou met à jour) un abonnement push pour un client ou le vendeur.
// Même appareil / même endpoint : on fusionne les rôles (client + vendeur = both)
// au lieu d'écraser — sinon activer la cloche boutique retire l'admin des push.
export async function savePushSubscription(input: PushSubscriptionInput) {
  if (!input.endpoint || !input.p256dh || !input.auth) return { ok: false as const }

  const incomingRole = input.role === "vendeur" ? "vendeur" : "client"
  const incomingToken = input.customerToken?.trim() || null

  const [existing] = await db
    .select({
      role: pushSubscriptions.role,
      customerToken: pushSubscriptions.customerToken,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .limit(1)

  const role = mergePushRole(existing?.role, incomingRole)
  // Ne jamais perdre le token client : un re-save vendeur sur le même
  // endpoint doit continuer à pouvoir recevoir les notifs perso.
  const customerToken = incomingToken || existing?.customerToken || null

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
