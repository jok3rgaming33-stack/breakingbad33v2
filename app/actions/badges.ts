"use server"

import { db } from "@/lib/db"
import { productBadges } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"

// Récupère tous les bandeaux sous forme de map { productKey: badge }
export async function getProductBadges(): Promise<Record<string, string>> {
  const rows = await db.select().from(productBadges)
  const map: Record<string, string> = {}
  for (const r of rows) map[r.productKey] = r.badge
  return map
}

// Pose / met à jour / retire un bandeau (réservé à l'admin authentifié).
// badge = "" pour retirer le bandeau.
export async function setProductBadge(productKey: string, badge: string) {
  const ok = await isAdminAuthenticated()
  if (!ok) return { ok: false as const, error: "unauthorized" }

  const key = productKey.trim()
  if (!key) return { ok: false as const, error: "invalid" }

  if (!badge) {
    await db.delete(productBadges).where(eq(productBadges.productKey, key))
  } else {
    await db
      .insert(productBadges)
      .values({ productKey: key, badge })
      .onConflictDoUpdate({
        target: productBadges.productKey,
        set: { badge, updatedAt: sql`now()` },
      })
  }

  revalidatePath("/")
  return { ok: true as const }
}
