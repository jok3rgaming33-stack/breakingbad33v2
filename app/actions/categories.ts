"use server"

import { db } from "@/lib/db"
import { categories, products, type Category } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { revalidatePath } from "next/cache"
import { asc, eq, sql } from "drizzle-orm"

// Liste toutes les catégories triées par ordre d'affichage.
export async function listCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id))
}

// Génère une clé unique à partir d'un nom (slug + suffixe si collision).
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cat"
  )
}

// Crée une nouvelle catégorie (réservé admin).
export async function createCategory(name: string) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const trimmed = name?.trim()
  if (!trimmed) return { ok: false as const, error: "Nom requis" }

  let key = slugify(trimmed)
  // Garantit l'unicité de la clé.
  const existing = await db.select({ key: categories.key }).from(categories)
  const taken = new Set(existing.map((c) => c.key))
  if (taken.has(key)) {
    let i = 2
    while (taken.has(`${key}-${i}`)) i++
    key = `${key}-${i}`
  }

  const maxOrder = await db.select({ m: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int` }).from(categories)
  const sortOrder = (maxOrder[0]?.m ?? -1) + 1

  const [row] = await db.insert(categories).values({ key, name: trimmed, sortOrder }).returning()
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const, category: row }
}

// Renomme une catégorie (la clé reste inchangée pour ne pas casser les produits).
export async function renameCategory(id: number, name: string) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const trimmed = name?.trim()
  if (!trimmed) return { ok: false as const, error: "Nom requis" }
  await db.update(categories).set({ name: trimmed }).where(eq(categories.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

// Supprime une catégorie. Les produits associés sont déplacés vers une autre
// catégorie (la première restante) pour ne jamais perdre de produit.
export async function deleteCategory(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const all = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id))
  if (all.length <= 1) return { ok: false as const, error: "Au moins une catégorie est requise." }
  const target = all.find((c) => c.id === id)
  if (!target) return { ok: false as const, error: "Introuvable." }
  const fallback = all.find((c) => c.id !== id)!

  // Réaffecte les produits orphelins vers la catégorie de repli.
  await db.update(products).set({ section: fallback.key }).where(eq(products.section, target.key))
  await db.delete(categories).where(eq(categories.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const, movedTo: fallback.key }
}

// Réordonne les catégories selon la liste d'identifiants fournie.
export async function reorderCategories(orderedIds: number[]) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  await Promise.all(
    orderedIds.map((id, idx) => db.update(categories).set({ sortOrder: idx }).where(eq(categories.id, id))),
  )
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}
