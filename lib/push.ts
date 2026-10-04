import "server-only"
import webpush from "web-push"
import { db } from "@/lib/db"
import { pushSubscriptions, users } from "@/lib/db/schema"
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm"
import { orderThreads, threadMessages } from "@/lib/db/schema"
import { clientThreadUrl, sectionForThreadStatus } from "@/lib/deep-links"

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
  /** Image OS (Android) — URL absolue publique */
  image?: string
  /** Suivi lecture broadcast admin */
  notificationId?: number
  customerToken?: string
  badgeCount?: number
  /** Deep-link : id fil + section (messaging | orders | locker) */
  threadId?: number
  open?: string
}

// 404/410 = abonnement mort. 401/403 = clé VAPID qui ne correspond plus :
// on retire la ligne pour que le navigateur puisse se réabonner.
function isDeadSubscription(statusCode: number | undefined) {
  return statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 410
}

// Envoie une notification à une liste d'abonnements et nettoie ceux qui sont expirés.
// Chaque envoi a son propre délai : un endpoint qui ne répond pas ne bloque pas les autres.
async function sendToRows(
  rows: { id: number; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
) {
  if (!ensureConfigured() || rows.length === 0) return
  const data = JSON.stringify(payload)
  await Promise.all(
    rows.map(async (row) => {
      try {
        await Promise.race([
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            data,
            {
              // TTL 24h : si le téléphone est hors ligne ou en Doze, le serveur FCM
              // conserve la notification jusqu'à 86400s avant de l'abandonner.
              // Sans TTL (défaut = 0) la notification est perdue si elle ne peut
              // pas être livrée immédiatement.
              TTL: 86400,
              urgency: "high",
              timeout: 10000,
            },
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error("push timeout"), { statusCode: 0 })), 12000),
          ),
        ])
      } catch (err: any) {
        if (isDeadSubscription(err?.statusCode)) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id)).catch(() => {})
        } else {
          console.log("[v0] push send error:", err?.statusCode, err?.body || err?.message)
        }
      }
    }),
  )
}

// Un abonnement vient d'être créé ou rattaché à un compte : renvoyer le dernier
// message vendeur récent, sinon le push de bienvenue / commande est parti dans le vide
// (le client n'était pas encore abonné au moment de l'envoi).
export async function nudgeRecentCustomerPush(customerToken: string) {
  if (!customerToken) return
  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const [row] = await db
      .select({
        id: orderThreads.id,
        status: orderThreads.status,
        summary: orderThreads.summary,
      })
      .from(threadMessages)
      .innerJoin(orderThreads, eq(threadMessages.threadId, orderThreads.id))
      .where(
        and(
          eq(orderThreads.customerToken, customerToken),
          eq(threadMessages.sender, "vendeur"),
          gt(threadMessages.createdAt, since),
        ),
      )
      .orderBy(desc(threadMessages.createdAt))
      .limit(1)
    if (!row) return
    const welcome = (row.summary || "").toLowerCase().includes("bienvenue")
    const open = sectionForThreadStatus(row.status)
    await notifyCustomer(customerToken, {
      title: welcome ? "Bienvenue sur BreakingBad33" : "Tu as un message",
      body: welcome
        ? "Ton accès est créé. Ouvre la messagerie pour le message de bienvenue."
        : "Un message ou une mise à jour t'attend.",
      url: clientThreadUrl(open, row.id),
      tag: `nudge-${row.id}-${Date.now()}`,
      threadId: row.id,
      open,
    })
  } catch (e) {
    console.log("[v0] nudge recent push:", e)
  }
}

// Notifie tous les appareils d'un client (par son token).
export async function notifyCustomer(customerToken: string | null | undefined, payload: PushPayload) {
  if (!customerToken) return
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .leftJoin(users, eq(users.token, pushSubscriptions.customerToken))
    .where(
      and(
        inArray(pushSubscriptions.role, ["client", "both"]),
        eq(pushSubscriptions.customerToken, customerToken),
        // exclude null ou compte introuvable = on livre. Seul un vrai "exclu" bloque.
        or(
          isNull(users.id),
          isNull(users.excludeNotifications),
          eq(users.excludeNotifications, false),
        ),
      ),
    )
  await sendToRows(rows, payload)
}

// Notifie tous les appareils du vendeur (admin).
export async function notifyVendor(payload: PushPayload) {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.role, ["vendeur", "both"]))
  await sendToRows(rows, payload)
}

// Notifie tous les clients abonnés (diffusion, ex. publication d'une news).
export async function notifyAllClients(payload: PushPayload) {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .leftJoin(users, eq(users.token, pushSubscriptions.customerToken))
    .where(
      and(
        inArray(pushSubscriptions.role, ["client", "both"]),
        or(
          isNull(users.id),
          isNull(users.excludeNotifications),
          eq(users.excludeNotifications, false),
        ),
      ),
    )
  await sendToRows(rows, payload)
}
