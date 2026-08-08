// Renvoi manuel de l'invitation à noter les produits pour la commande #229.
// Reproduit exactement la logique serveur de sendRatingInvites() (app/actions/ratings.ts) :
// message [NOTER_PRODUITS] dans le fil + notification push au client.
import pg from "pg"
import webpush from "web-push"

const THREAD_ID = 229

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const RATING_INVITE_TAG = "[NOTER_PRODUITS]"
const body = [
  RATING_INVITE_TAG,
  "Bonjour ! Nous espérons que ta commande t'a plu.",
  "",
  "Prends 1 minute pour noter ton expérience produit par produit — ça nous aide vraiment à améliorer le labo.",
  "",
  "Merci,",
  "Le chimiste",
].join("\n")

const c = await pool.connect()
try {
  const { rows: threadRows } = await c.query(
    `SELECT id, status, customer_token, product_ids, fulfillment FROM order_threads WHERE id = $1`,
    [THREAD_ID],
  )
  const order = threadRows[0]
  if (!order) throw new Error(`Commande #${THREAD_ID} introuvable`)
  if (order.status !== "livree") throw new Error(`Commande #${THREAD_ID} pas livrée (status=${order.status})`)
  const pids = Array.isArray(order.product_ids) ? order.product_ids : []
  if (!pids.length) throw new Error(`Commande #${THREAD_ID} sans product_ids`)
  console.log("[v0] Commande OK :", { status: order.status, product_ids: pids, token: order.customer_token.slice(0, 10) + "…" })

  // Insertion du message d'invitation
  const { rows: inserted } = await c.query(
    `INSERT INTO thread_messages (thread_id, sender, body) VALUES ($1, 'vendeur', $2) RETURNING id, created_at`,
    [THREAD_ID, body],
  )
  console.log("[v0] Message inséré :", inserted[0])

  await c.query(`UPDATE order_threads SET updated_at = now() WHERE id = $1`, [THREAD_ID])

  // Notification push au client
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
  const SUBJECT = process.env.VAPID_SUBJECT || "mailto:contact@breakingbad33.com"

  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.log("[v0] VAPID keys manquantes, push ignoré")
  } else {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
    const { rows: subs } = await c.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE role = 'client' AND customer_token = $1`,
      [order.customer_token],
    )
    console.log(`[v0] ${subs.length} abonnement(s) push trouvé(s) pour ce client`)

    const open = order.fulfillment === "locker" ? "locker" : "orders"
    const url = `/?open=${open}&thread=${THREAD_ID}`
    const payload = JSON.stringify({
      title: "Note ton expérience ⭐",
      body: "Un message t'attend pour noter les produits de ta commande livrée.",
      url,
      tag: `rating-invite-${THREAD_ID}`,
      threadId: THREAD_ID,
      open,
    })

    for (const row of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          { TTL: 86400, urgency: "high" },
        )
        console.log(`[v0] Push envoyé -> abonnement #${row.id}`)
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await c.query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id])
          console.log(`[v0] Abonnement #${row.id} expiré, supprimé`)
        } else {
          console.log(`[v0] Erreur push abonnement #${row.id}:`, err?.statusCode, err?.body)
        }
      }
    }
  }

  // Vérification finale : relire le dernier message du fil
  const { rows: check } = await c.query(
    `SELECT id, sender, body, created_at FROM thread_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [THREAD_ID],
  )
  console.log("[v0] Dernier message du fil après renvoi :", check[0])
} finally {
  c.release()
  await pool.end()
}
