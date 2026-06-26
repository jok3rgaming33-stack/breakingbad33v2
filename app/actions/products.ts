"use server"

import { db } from "@/lib/db"
import { products, type Product, type ProductVariant } from "@/lib/db/schema"
import { isAdminAuthenticated } from "@/app/actions/admin-auth"
import { revalidatePath } from "next/cache"
import { asc, eq, sql } from "drizzle-orm"

// Liste tous les produits (admin) triés par section puis ordre.
export async function listProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(asc(products.section), asc(products.sortOrder), asc(products.id))
}

// Produits d'une section donnée (boutique client).
export async function getProductsBySection(section: "featured" | "arrival"): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.section, section))
    .orderBy(asc(products.sortOrder), asc(products.id))
}

export type ProductInput = {
  id?: number
  title: string
  section: "featured" | "arrival"
  image?: string | null
  symbol?: string | null
  number?: string | null
  description?: string | null
  fullDescription?: string | null
  stock: number
  variants: ProductVariant[]
  badges: string[]
  discountType?: "percent" | "fixed" | null
  discountValue?: number | null
  sortOrder?: number
}

function sanitizeVariants(variants: ProductVariant[]): ProductVariant[] {
  if (!Array.isArray(variants)) return []
  return variants
    .map((v) => ({ qty: Math.max(1, Math.trunc(Number(v.qty) || 0)), price: Math.max(0, Math.trunc(Number(v.price) || 0)) }))
    .filter((v) => v.qty > 0)
}

// Crée ou met à jour un produit (réservé admin).
export async function saveProduct(input: ProductInput) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  const title = input.title?.trim()
  if (!title) return { ok: false as const, error: "Titre requis" }

  const values = {
    title,
    section: input.section === "arrival" ? "arrival" : "featured",
    image: input.image?.trim() || null,
    symbol: input.symbol?.trim() || null,
    number: input.number?.trim() || null,
    description: input.description?.trim() || null,
    fullDescription: input.fullDescription?.trim() || null,
    stock: Math.max(0, Math.trunc(Number(input.stock) || 0)),
    variants: sanitizeVariants(input.variants),
    badges: Array.isArray(input.badges) ? input.badges.filter(Boolean) : [],
    discountType: input.discountType ?? null,
    discountValue: input.discountValue != null ? Math.max(0, Math.trunc(input.discountValue)) : null,
    sortOrder: Math.trunc(Number(input.sortOrder) || 0),
  }

  if (input.id) {
    await db.update(products).set(values).where(eq(products.id, input.id))
  } else {
    await db.insert(products).values(values)
  }

  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

// Supprime un produit (réservé admin).
export async function deleteProduct(id: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  if (!id) return { ok: false as const }
  await db.delete(products).where(eq(products.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

// Ajuste le stock (réservé admin) : delta peut être négatif.
export async function adjustStock(id: number, delta: number) {
  if (!(await isAdminAuthenticated())) return { ok: false as const, error: "unauthorized" }
  if (!id || !Number.isFinite(delta)) return { ok: false as const }
  await db
    .update(products)
    .set({ stock: sql`GREATEST(0, ${products.stock} + ${Math.trunc(delta)})` })
    .where(eq(products.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true as const }
}

// Décrémente le stock à l'achat (appelé côté client après ajout au panier).
// Non réservé admin : c'est une action client légitime.
export async function decrementStock(id: number, qty: number) {
  if (!id || !Number.isFinite(qty) || qty <= 0) return { ok: false as const }
  const rows = await db
    .update(products)
    .set({ stock: sql`GREATEST(0, ${products.stock} - ${Math.trunc(qty)})` })
    .where(eq(products.id, id))
    .returning({ stock: products.stock })
  revalidatePath("/")
  return { ok: true as const, stock: rows[0]?.stock ?? 0 }
}
