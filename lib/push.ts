import "server-only"
import webpush from "web-push"
import { db } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:contact@breakingbad33.com"

let configured = false
function ensureConfigured() {
  if (configured) return true
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.log("[v0] VAPID keys missing, push disabled")
    return false
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

// Envoie une notification à une liste d'abonnements et nettoie ceux qui sont expirés.
async function sendToRows(
  rows: { id: number; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
) {
  if (!ensureConfigured() || rows.length === 0) return
  const data = JSON.stringify(payload)
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          data,
          {
            // TTL 24h : si le téléphone est hors ligne ou en Doze, le serveur FCM
            // conserve la notification jusqu'à 86400s avant de l'abandonner.
            // Sans TTL (défaut = 0) la notification est perdue si elle ne peut
            // pas être livrée immédiatement.
            TTL: 86400,
            urgency: "high", // Contourne partiellement le Doze Mode Android
          }
        )
      } catch (err: any) {
        // 404/410 = abonnement expiré : on le supprime.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id))
        } else {
          console.log("[v0] push send error:", err?.statusCode, err?.body)
        }
      }
    }),
  )
}

// Notifie tous les appareils d'un client (par son token).
export async function notifyCustomer(customerToken: string | null | undefined, payload: PushPayload) {
  if (!customerToken) return
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.role, "client"), eq(pushSubscriptions.customerToken, customerToken)))
  await sendToRows(rows, payload)
}

// Notifie tous les appareils du vendeur (admin).
export async function notifyVendor(payload: PushPayload) {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.role, "vendeur"))
  await sendToRows(rows, payload)
}

// Notifie tous les clients abonnés (diffusion, ex. publication d'une news).
export async function notifyAllClients(payload: PushPayload) {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.role, "client"))
  await sendToRows(rows, payload)
}
