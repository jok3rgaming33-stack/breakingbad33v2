import "server-only"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

let ready = false

/**
 * Colonnes / index pour les features top 5 (idempotent).
 * Évite une migration manuelle sur Neon/Vercel.
 */
export async function ensureFeatureSchema(): Promise<void> {
  if (ready) return
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

    ready = true
  } catch (e) {
    console.error("[feature-schema] ensure failed:", e)
  }
}
