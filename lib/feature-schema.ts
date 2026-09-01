import "server-only"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/** Une seule promesse partagée : évite 11× ALTER TABLE en parallèle (locks Neon → hang). */
let schemaPromise: Promise<void> | null = null

/**
 * Colonnes / index pour les features top 5 (idempotent).
 * Évite une migration manuelle sur Neon/Vercel.
 */
export async function ensureFeatureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      try {
        // Parrainage
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_granted BOOLEAN NOT NULL DEFAULT false`)
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uidx
          ON users (referral_code)
          WHERE referral_code IS NOT NULL
        `)

        // Rappels locker
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS locker_reminder_count INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS locker_last_reminder_at TIMESTAMPTZ`)

        // Lecture client des messages vendeur (fiche 360 + messagerie)
        await db.execute(sql`ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS client_read_at TIMESTAMPTZ`)

        // Paliers fidélité avancés
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS peak_tier TEXT NOT NULL DEFAULT 'bronze'`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_delivery_until TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_delivery_start_notified_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_delivery_ending_notified_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_discount INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_points_awarded INTEGER`)
        await db.execute(sql`
          ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS tracking JSONB NOT NULL DEFAULT '{}'::jsonb
        `)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS run_token TEXT`)

        // Platine : démarre le mois de livraison offerte SANS attendre une visite client
        // 1) Déjà peak_tier = platinum sans date
        await db.execute(sql`
          UPDATE users
          SET free_delivery_until = NOW() + INTERVAL '30 days'
          WHERE lower(peak_tier) = 'platinum'
            AND free_delivery_until IS NULL
        `)
        // 2) CA livré ≥ 600€ (seuil Platine) : pose peak + démarre le mois si pas encore daté
        await db.execute(sql`
          UPDATE users u
          SET
            peak_tier = 'platinum',
            free_delivery_until = CASE
              WHEN u.free_delivery_until IS NULL THEN NOW() + INTERVAL '30 days'
              ELSE u.free_delivery_until
            END
          FROM (
            SELECT customer_token AS token
            FROM order_threads
            WHERE status = 'livree'
              AND customer_token IS NOT NULL
            GROUP BY customer_token
            HAVING SUM(COALESCE(total, 0) + COALESCE(loyalty_discount, 0)) >= 600
          ) s
          WHERE u.token = s.token
            AND (
              lower(COALESCE(u.peak_tier, 'bronze')) <> 'platinum'
              OR u.free_delivery_until IS NULL
            )
        `)

        // Journal connexions : heure de déconnexion
        await db.execute(sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS logged_out_at TIMESTAMPTZ`)

        // Réservations Platine
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS product_reservations (
            id SERIAL PRIMARY KEY,
            product_id INTEGER NOT NULL,
            user_token TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS product_reservations_user_idx
          ON product_reservations (user_token)
        `)
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS product_reservations_product_idx
          ON product_reservations (product_id, status)
        `)
      } catch (e) {
        schemaPromise = null
        console.error("[feature-schema] ensure failed:", e)
        throw e
      }
    })()
  }
  try {
    await schemaPromise
  } catch {
    /* non bloquant pour les lecteurs */
  }
}
