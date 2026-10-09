"use server"

import { pool } from "@/lib/db"
import { notifyCustomer } from "@/lib/push"
import { clientThreadUrl } from "@/lib/deep-links"
import { ensureFeatureSchema } from "@/lib/feature-schema"

/** Une passe par jour : tout ce qui expire dans les 36 h, une seule fois. */
const LOOKAHEAD_HOURS = 36
const THREAD_SUMMARY = "Albuquerque Luck Spin"

type GrantRow = { id: number; user_token: string; expires_at: Date }
type VoucherRow = { id: number; user_token: string; kind: string; expires_at: Date }

function parisWhen(value: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function perkLabel(kind: string): string {
  if (kind === "walter") return "bon −20€ sur les produits"
  if (kind === "jesse") return "bon −10€ sur les produits"
  if (kind === "gus") return "livraison offerte"
  return "avantage boutique"
}

function messageBody(spins: GrantRow[], vouchers: VoucherRow[]): string {
  const lines = ["Albuquerque Luck Spin", ""]
  if (spins.length > 0) {
    const soon = spins.reduce((a, b) => (new Date(a.expires_at) < new Date(b.expires_at) ? a : b))
    lines.push(
      spins.length === 1
        ? `Tu as 1 tour non utilisé. Il expire le ${parisWhen(soon.expires_at)} (heure de Paris). Passé cette heure, il est perdu.`
        : `Tu as ${spins.length} tours non utilisés. Le plus proche expire le ${parisWhen(soon.expires_at)} (heure de Paris). Passé cette heure, il est perdu.`,
    )
    lines.push("")
  }
  if (vouchers.length > 0) {
    const bits = vouchers.map((v) => `${perkLabel(v.kind)}, jusqu'au ${parisWhen(v.expires_at)}`)
    const lead = spins.length > 0 ? "Tu as aussi " : "Tu as "
    lines.push(
      vouchers.length === 1
        ? `${lead}1 avantage non utilisé : ${bits[0]}.`
        : `${lead}${vouchers.length} avantages non utilisés : ${bits.join(" ; ")}.`,
    )
    lines.push("")
  }
  lines.push("Ouvre Albuquerque Luck Spin pour les utiliser.")
  lines.push("")
  lines.push("L'équipe BreakingBad33")
  return lines.join("\n")
}

function pushCopy(spins: GrantRow[], vouchers: VoucherRow[]): { title: string; body: string } {
  const soonest = [...spins, ...vouchers].reduce<Date | null>((min, row) => {
    const at = new Date(row.expires_at)
    return !min || at < min ? at : min
  }, null)
  const when = soonest ? parisWhen(soonest) : ""
  if (spins.length > 0 && vouchers.length > 0) {
    return {
      title: "Tours et avantages bientôt expirés",
      body: `${spins.length} tour${spins.length > 1 ? "s" : ""} et ${vouchers.length} avantage${vouchers.length > 1 ? "s" : ""} expirent bientôt${when ? ` · ${when}` : ""}.`,
    }
  }
  if (spins.length > 0) {
    return {
      title: spins.length > 1 ? "Tes tours expirent bientôt" : "Ton tour expire bientôt",
      body: when ? `Échéance : ${when}. Ouvre Albuquerque Luck Spin.` : "Ouvre Albuquerque Luck Spin avant qu'il soit perdu.",
    }
  }
  return {
    title: vouchers.length > 1 ? "Tes avantages expirent bientôt" : "Un avantage expire bientôt",
    body: when ? `À utiliser avant le ${when}.` : "Ouvre Albuquerque Luck Spin pour l'utiliser.",
  }
}

async function ensureReminderThread(
  client: import("pg").PoolClient,
  token: string,
  pseudo: string,
): Promise<number | null> {
  const existing = await client.query(
    `SELECT id FROM order_threads
     WHERE customer_token = $1 AND status = 'discussion' AND summary = $2
     ORDER BY id DESC
     LIMIT 1`,
    [token, THREAD_SUMMARY],
  )
  const found = Number(existing.rows[0]?.id ?? 0)
  if (found > 0) return found
  const tracking = `MSG_${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`
  const inserted = await client.query(
    `INSERT INTO order_threads (
       customer_name, customer_token, tracking_token, summary, total, fulfillment, status, product_ids, tracking
     )
     VALUES ($1, $2, $3, $4, 0, 'livraison', 'discussion', '[]'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [pseudo || "Client", token, tracking, THREAD_SUMMARY],
  )
  const id = Number(inserted.rows[0]?.id ?? 0)
  return id > 0 ? id : null
}

/**
 * Rappel 24 h avant l'expiration des tours et des bons non utilisés.
 * Le cron est quotidien : la fenêtre est de 36 h pour ne pas rater
 * un tour qui expirerait juste après la passe de la veille.
 * Un même tour ou bon n'est rappelé qu'une fois.
 */
export async function processSlotExpiryReminders(): Promise<{
  users: number
  spins: number
  vouchers: number
}> {
  await ensureFeatureSchema()
  const client = await pool.connect()
  const pushes: { token: string; threadId: number; title: string; body: string; tag: string }[] = []
  let users = 0
  let spins = 0
  let vouchers = 0
  try {
    await client.query("BEGIN")
    const grants = await client.query<GrantRow>(
      `SELECT id, user_token, expires_at FROM slot_grants
       WHERE status = 'available' AND test_mode = false
         AND expiry_reminded_at IS NULL
         AND expires_at > NOW()
         AND expires_at <= NOW() + make_interval(hours => $1::int)
       ORDER BY expires_at ASC
       FOR UPDATE`,
      [LOOKAHEAD_HOURS],
    )
    const bonus = await client.query<VoucherRow>(
      `SELECT id, user_token, kind, expires_at FROM slot_vouchers
       WHERE status = 'active' AND test_mode = false
         AND expiry_reminded_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at > NOW()
         AND expires_at <= NOW() + make_interval(hours => $1::int)
       ORDER BY expires_at ASC
       FOR UPDATE`,
      [LOOKAHEAD_HOURS],
    )
    const byToken = new Map<string, { spins: GrantRow[]; vouchers: VoucherRow[] }>()
    for (const row of grants.rows) {
      const bucket = byToken.get(row.user_token) ?? { spins: [], vouchers: [] }
      bucket.spins.push(row)
      byToken.set(row.user_token, bucket)
    }
    for (const row of bonus.rows) {
      const bucket = byToken.get(row.user_token) ?? { spins: [], vouchers: [] }
      bucket.vouchers.push(row)
      byToken.set(row.user_token, bucket)
    }
    if (byToken.size === 0) {
      await client.query("COMMIT")
      return { users: 0, spins: 0, vouchers: 0 }
    }

    const tokens = [...byToken.keys()]
    const people = await client.query<{ id: number; token: string; pseudo: string }>(
      `SELECT id, token, pseudo FROM users WHERE token = ANY($1::text[])`,
      [tokens],
    )
    const personByToken = new Map(people.rows.map((p) => [p.token, p]))

    let save = 0
    for (const [token, bucket] of byToken) {
      save += 1
      const point = `slot_expiry_${save}`
      await client.query(`SAVEPOINT ${point}`)
      try {
        const grantIds = bucket.spins.map((r) => r.id)
        const voucherIds = bucket.vouchers.map((r) => r.id)
        const person = personByToken.get(token)
        if (person) {
          const threadId = await ensureReminderThread(client, token, person.pseudo || "Client")
          if (!threadId) throw new Error("thread")
          await client.query(
            `INSERT INTO thread_messages (thread_id, sender, body) VALUES ($1, 'vendeur', $2)`,
            [threadId, messageBody(bucket.spins, bucket.vouchers)],
          )
          await client.query(`UPDATE order_threads SET updated_at = NOW() WHERE id = $1`, [threadId])
          const copy = pushCopy(bucket.spins, bucket.vouchers)
          pushes.push({
            token,
            threadId,
            title: copy.title,
            body: copy.body,
            tag: `slot-expiry-${person.id}-${threadId}`,
          })
        }
        if (grantIds.length > 0) {
          await client.query(
            `UPDATE slot_grants SET expiry_reminded_at = NOW() WHERE id = ANY($1::int[])`,
            [grantIds],
          )
        }
        if (voucherIds.length > 0) {
          await client.query(
            `UPDATE slot_vouchers SET expiry_reminded_at = NOW() WHERE id = ANY($1::int[])`,
            [voucherIds],
          )
        }
        await client.query(`RELEASE SAVEPOINT ${point}`)
        users += person ? 1 : 0
        spins += grantIds.length
        vouchers += voucherIds.length
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT ${point}`)
        console.error("[slot-expiry] user skipped", e)
      }
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("[slot-expiry] failed", e)
    return { users: 0, spins: 0, vouchers: 0 }
  } finally {
    client.release()
  }

  for (const job of pushes) {
    try {
      await notifyCustomer(job.token, {
        title: job.title,
        body: job.body,
        url: clientThreadUrl("messaging", job.threadId),
        tag: job.tag,
        threadId: job.threadId,
        open: "messaging",
      })
    } catch (e) {
      console.error("[slot-expiry] push", e)
    }
  }

  console.info("[slot-expiry] reminded", { users, spins, vouchers })
  return { users, spins, vouchers }
}
