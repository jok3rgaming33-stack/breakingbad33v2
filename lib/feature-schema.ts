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
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_discount INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS loyalty_points_awarded INTEGER`)

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
