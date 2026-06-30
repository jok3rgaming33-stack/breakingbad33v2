"use server"

import { db } from "@/lib/db"
import { news, newsSlides, promoUsages, userNewsReads } from "@/lib/db/schema"
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { notifyAllClients } from "@/lib/push"

export type SlideInput = {
  id?: number
  order?: number
  title?: string | null
  content?: string | null
  imageUrl?: string | null
  buttonText?: string | null
  buttonLink?: string | null
  promoCode?: string | null
  promoType?: "percent" | "fixed" | "produit" | null
  promoValue?: number | null
  productName?: string | null
  minAmount?: number | null
  isSingleUse?: boolean
}

/* ----------------------------- ADMIN : NEWS ----------------------------- */

// Liste toutes les news avec le nombre de slides (pour le panel admin).
export async function listNews() {
  const rows = await db
    .select({
      id: news.id,
      title: news.title,
      isActive: news.isActive,
      createdAt: news.createdAt,
      updatedAt: news.updatedAt,
      slideCount: sql<number>`count(${newsSlides.id})::int`,
    })
    .from(news)
    .leftJoin(newsSlides, eq(newsSlides.newsId, news.id))
    .groupBy(news.id)
    .orderBy(desc(news.createdAt))
  return rows
}

// Récupère une news et ses slides (triés par ordre).
export async function getNewsWithSlides(newsId: number) {
  const [item] = await db.select().from(news).where(eq(news.id, newsId))
  if (!item) return null
  const slides = await db
    .select()
    .from(newsSlides)
    .where(eq(newsSlides.newsId, newsId))
    .orderBy(asc(newsSlides.order), asc(newsSlides.id))
  return { news: item, slides }
}

// Crée une news vide (brouillon non publié).
export async function createNews(title: string) {
  const t = title?.trim() || "Nouvelle annonce"
  const [row] = await db.insert(news).values({ title: t }).returning()
  revalidatePath("/admin")
  return { id: row.id }
}

// Met à jour le titre et/ou l'état actif d'une news.
export async function updateNews(id: number, patch: { title?: string; isActive?: boolean }) {
  if (!id) return { ok: false as const }
  await db
    .update(news)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(news.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}

// Supprime une news, ses slides et les lectures associées.
export async function deleteNews(id: number) {
  if (!id) return { ok: false as const }
  await db.delete(newsSlides).where(eq(newsSlides.newsId, id))
  await db.delete(userNewsReads).where(eq(userNewsReads.newsId, id))
  await db.delete(news).where(eq(news.id, id))
  revalidatePath("/admin")
  return { ok: true as const }
}

/* ---------------------------- ADMIN : SLIDES ---------------------------- */

// Crée ou met à jour un slide (selon présence de l'id).
export async function upsertSlide(newsId: number, input: SlideInput) {
  if (!newsId) return { ok: false as const }
  const values = {
    newsId,
    order: input.order ?? 0,
    title: input.title?.trim() || null,
    content: input.content?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
    buttonText: input.buttonText?.trim() || null,
    buttonLink: input.buttonLink?.trim() || null,
    promoCode: input.promoCode?.trim()?.toUpperCase() || null,
    promoType: input.promoType ?? null,
    promoValue: input.promoValue ?? null,
    productName: input.promoType === "produit" ? input.productName?.trim() || null : null,
    minAmount: input.minAmount ?? null,
    isSingleUse: input.isSingleUse ?? true,
  }
  if (input.id) {
    await db.update(newsSlides).set(values).where(eq(newsSlides.id, input.id))
  } else {
    await db.insert(newsSlides).values(values)
  }
  await db.update(news).set({ updatedAt: sql`now()` }).where(eq(news.id, newsId))
  revalidatePath("/admin")
  return { ok: true as const }
}

// Supprime un slide.
export async function deleteSlide(slideId: number) {
  if (!slideId) return { ok: false as const }
  await db.delete(newsSlides).where(eq(newsSlides.id, slideId))
  revalidatePath("/admin")
  return { ok: true as const }
}

// Active une news (et désactive les autres pour n'avoir qu'un popup à la fois),
// puis envoie une notification push à tous les clients abonnés.
export async function publishAndNotify(newsId: number) {
  if (!newsId) return { ok: false as const }
  const [item] = await db.select().from(news).where(eq(news.id, newsId))
  if (!item) return { ok: false as const }

  await db.update(news).set({ isActive: false }).where(notInArray(news.id, [newsId]))
  await db.update(news).set({ isActive: true, updatedAt: sql`now()` }).where(eq(news.id, newsId))

  await notifyAllClients({
    title: "Nouvelle annonce BreakingBad33",
    body: item.title,
    url: "/",
    tag: `news-${newsId}`,
  })

  revalidatePath("/admin")
  revalidatePath("/")
  return { ok: true as const }
}

/* ----------------------------- CLIENT : POPUP --------------------------- */

// Renvoie la news active la plus récente non encore vue par ce client, avec ses slides.
export async function getActiveNewsForUser(userToken: string | null | undefined) {
  const token = userToken?.trim()
  const active = await db
    .select()
    .from(news)
    .where(eq(news.isActive, true))
    .orderBy(desc(news.updatedAt))

  for (const item of active) {
    if (token) {
      const [seen] = await db
        .select({ id: userNewsReads.id })
        .from(userNewsReads)
        .where(and(eq(userNewsReads.userToken, token), eq(userNewsReads.newsId, item.id)))
        .limit(1)
      if (seen) continue
    }
    const slides = await db
      .select()
      .from(newsSlides)
      .where(eq(newsSlides.newsId, item.id))
      .orderBy(asc(newsSlides.order), asc(newsSlides.id))

    // Si la news n'a aucun slide, on affiche tout de même un slide par défaut
    // basé sur son titre, pour que le popup apparaisse bien côté client.
    if (slides.length === 0) {
      return {
        news: item,
        slides: [
          {
            id: -item.id,
            newsId: item.id,
            order: 0,
            title: item.title,
            content: null,
            imageUrl: null,
            buttonText: null,
            buttonLink: null,
            promoCode: null,
            promoType: null,
            promoValue: null,
            productName: null,
            minAmount: null,
            isSingleUse: true,
            promoUsed: false,
          },
        ],
      }
    }
    // Indique pour chaque promo si ce client l'a déjà utilisée.
    const slidesWithUsage = await Promise.all(
      slides.map(async (s) => {
        let promoUsed = false
        if (s.promoCode && token) {
          const [u] = await db
            .select({ id: promoUsages.id })
            .from(promoUsages)
            .where(and(eq(promoUsages.promoCode, s.promoCode), eq(promoUsages.userToken, token)))
            .limit(1)
          promoUsed = Boolean(u)
        }
        return { ...s, promoUsed }
      }),
    )
    return { news: item, slides: slidesWithUsage }
  }
  return null
}

// Marque une news comme vue par ce client.
export async function markNewsRead(userToken: string | null | undefined, newsId: number) {
  const token = userToken?.trim()
  if (!token || !newsId) return { ok: false as const }
  await db
    .insert(userNewsReads)
    .values({ userToken: token, newsId })
    .onConflictDoNothing({ target: [userNewsReads.userToken, userNewsReads.newsId] })
  return { ok: true as const }
}

// Réclame la promo d'un slide : vérifie l'usage unique, l'enregistre et renvoie le détail.
export async function redeemPromo(userToken: string | null | undefined, slideId: number) {
  const token = userToken?.trim()
  if (!token) return { ok: false as const, reason: "no_token" as const }
  if (!slideId) return { ok: false as const, reason: "invalid" as const }

  const [slide] = await db.select().from(newsSlides).where(eq(newsSlides.id, slideId))
  if (!slide?.promoCode) return { ok: false as const, reason: "no_promo" as const }

  // Vérifie si déjà utilisé par ce client.
  const [existing] = await db
    .select({ id: promoUsages.id })
    .from(promoUsages)
    .where(and(eq(promoUsages.promoCode, slide.promoCode), eq(promoUsages.userToken, token)))
    .limit(1)
  if (existing && slide.isSingleUse) {
    return { ok: false as const, reason: "already_used" as const }
  }

  if (slide.isSingleUse) {
    await db
      .insert(promoUsages)
      .values({ promoCode: slide.promoCode, userToken: token, newsSlideId: slide.id })
      .onConflictDoNothing({ target: [promoUsages.promoCode, promoUsages.userToken] })
  }

  return {
    ok: true as const,
    promo: {
      code: slide.promoCode,
      type: (slide.promoType as "percent" | "fixed" | "produit" | null) ?? "fixed",
      value: slide.promoValue ?? 0,
      minAmount: slide.minAmount ?? 0,
      productName: slide.productName ?? null,
    },
  }
}
