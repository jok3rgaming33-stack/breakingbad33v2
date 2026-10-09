import "server-only"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/** Une seule promesse partagée : évite 11× ALTER TABLE en parallèle (locks Neon → hang). */
let schemaPromise: Promise<void> | null = null

/**
 * Colonnes lues par la connexion (drizzle sélectionne toute la ligne users).
 * Court exprès : le gros ensure (UPDATE de palier) ne doit pas passer sur le login.
 */
let loginColsPromise: Promise<void> | null = null

export async function ensureLoginColumns(): Promise<void> {
  if (!loginColsPromise) {
    loginColsPromise = (async () => {
      try {
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_anchor_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_cycle INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_claims INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_claim3_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_free_stopped BOOLEAN NOT NULL DEFAULT false`)
      } catch (e) {
        loginColsPromise = null
        throw e
      }
    })()
  }
  await loginColsPromise
}

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

        // Platine : démarre le mois de livraison offerte SANS attendre une visite client.
        // N'abaisse jamais un palier Ultimate déjà posé.
        // Isolé : un échec ici ne doit pas empêcher les colonnes suivantes
        // (sinon la connexion de tous les clients casse).
        try {
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
              lower(COALESCE(u.peak_tier, 'bronze')) NOT IN ('platinum', 'ultimate')
              OR (
                lower(COALESCE(u.peak_tier, 'bronze')) = 'platinum'
                AND u.free_delivery_until IS NULL
              )
            )
        `)
        } catch (e) {
          console.error("[feature-schema] palier platine non bloquant:", e)
        }

        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_anchor_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_cycle INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_claims INTEGER NOT NULL DEFAULT 0`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_claim3_at TIMESTAMPTZ`)
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS slot_free_stopped BOOLEAN NOT NULL DEFAULT false`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS slot_products_cents INTEGER`)
        await db.execute(sql`ALTER TABLE order_threads ADD COLUMN IF NOT EXISTS slot_block TEXT`)

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_credits (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL UNIQUE,
            user_token TEXT NOT NULL,
            products_cents INTEGER NOT NULL,
            spins_granted INTEGER NOT NULL,
            blocked TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_grants (
            id SERIAL PRIMARY KEY,
            user_token TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            order_id INTEGER,
            parent_grant_id INTEGER,
            cascade_depth INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'available',
            expires_at TIMESTAMPTZ NOT NULL,
            test_mode BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (source_type, source_id)
          )
        `)
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS slot_grants_user_status_idx
          ON slot_grants (user_token, status)
        `)
        await db.execute(sql`ALTER TABLE slot_grants ADD COLUMN IF NOT EXISTS expiry_reminded_at TIMESTAMPTZ`)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_plays (
            id SERIAL PRIMARY KEY,
            grant_id INTEGER NOT NULL UNIQUE,
            user_token TEXT NOT NULL,
            outcome TEXT NOT NULL,
            symbols JSONB NOT NULL,
            prize JSONB NOT NULL DEFAULT '{}'::jsonb,
            test_mode BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_vouchers (
            id SERIAL PRIMARY KEY,
            user_token TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL,
            amount_eur INTEGER,
            status TEXT NOT NULL DEFAULT 'active',
            play_id INTEGER,
            expires_at TIMESTAMPTZ,
            used_order_id INTEGER,
            test_mode BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.execute(sql`ALTER TABLE slot_vouchers ADD COLUMN IF NOT EXISTS expiry_reminded_at TIMESTAMPTZ`)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_point_entries (
            id SERIAL PRIMARY KEY,
            user_token TEXT NOT NULL,
            points INTEGER NOT NULL,
            reason TEXT NOT NULL,
            source_id TEXT NOT NULL UNIQUE,
            play_id INTEGER,
            order_id INTEGER,
            test_mode BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_free_claims (
            id SERIAL PRIMARY KEY,
            user_token TEXT NOT NULL,
            cycle_index INTEGER NOT NULL,
            window_index INTEGER NOT NULL,
            grant_id INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_token, cycle_index, window_index)
          )
        `)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS slot_weight_sets (
            id SERIAL PRIMARY KEY,
            version TEXT NOT NULL UNIQUE,
            weights JSONB NOT NULL,
            signed_note TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
