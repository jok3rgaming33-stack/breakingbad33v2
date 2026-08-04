"use server"

import { db } from "@/lib/db"
import {
  news,
  newsSlides,
  promoUsages,
  userNewsReads,
  type MediaAttachment,
} from "@/lib/db/schema"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { notifyAllClients } from "@/lib/push"

export type SlideInput = {
  id?: number
  order?: number
  title?: string | null
  content?: string | null
  imageUrl?: string | null
  media?: MediaAttachment[]
  buttonText?: string | null
  buttonLink?: string | null
  promoCode?: string | null
  promoType?: "percent" | "fixed" | "produit" | null
  promoValue?: number | null
  productName?: string | null
  minAmount?: number | null
  isSingleUse?: boolean
}

let schemaReady: Promise<void> | null = null

/** Colonnes multi-médias + index unique lectures (pas de migrate drizzle en prod). */
async function ensureNewsSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        ALTER TABLE news_slides
        ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb
      `)
      // Déduplique avant index unique (évite l'échec si anciennes doubles lectures).
      await db.execute(sql`
        DELETE FROM user_news_reads a
        USING user_news_reads b
        WHERE a.id < b.id
          AND a.user_token = b.user_token
          AND a.news_id = b.news_id
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS user_news_reads_user_token_news_id_idx
        ON user_news_reads (user_token, news_id)
      `)
    })().catch((e) => {
      schemaReady = null
      console.error("[news] ensureNewsSchema failed:", e)
    })
  }
  await schemaReady
}

function sanitizeMedia(media: MediaAttachment[] | null | undefined): MediaAttachment[] {
  if (!Array.isArray(media)) return []
  return media
    .filter((m) => m && (m.type === "image" || m.type === "video") && typeof m.url === "string" && m.url.trim())
    .map((m) => ({ type: m.type, url: m.url.trim() }))
}

/** Normalise les médias d'un slide (rétrocompat imageUrl seul). */
function resolveSlideMedia(slide: {
  imageUrl?: string | null
  media?: MediaAttachment[] | null
}): MediaAttachment[] {
  const fromJson = sanitizeMedia(slide.media ?? [])
  if (fromJson.length > 0) return fromJson
  const url = slide.imageUrl?.trim()
  if (!url) return []
  const isVideo = /\.(mp4|mov|m4v|webm|quicktime)(\?|$)/i.test(url)
  return [{ type: isVideo ? "video" : "image", url }]
}

/* ----------------------------- ADMIN : NEWS ----------------------------- */

// Liste toutes les news avec le nombre de slides (pour le panel admin).
export async function listNews() {
  await ensureNewsSchema()
  const rows = await db
    .select({
      id: news.id,
      title: news.title,
      isActive: news.isActive,
      sortOrder: news.sortOrder,
      createdAt: news.createdAt,
      updatedAt: news.updatedAt,
      slideCount: sql<number>`count(${newsSlides.id})::int`,
    })
    .from(news)
    .leftJoin(newsSlides, eq(newsSlides.newsId, news.id))
    .groupBy(news.id)
    .orderBy(asc(news.sortOrder), desc(news.createdAt))
  return rows
}

// Récupère une news et ses slides (triés par ordre).
export async function getNewsWithSlides(newsId: number) {
  await ensureNewsSchema()
  const [item] = await db.select().from(news).where(eq(news.id, newsId))
  if (!item) return null
  const slides = await db
    .select()
    .from(newsSlides)
    .where(eq(newsSlides.newsId, newsId))
    .orderBy(asc(newsSlides.order), asc(newsSlides.id))
  return {
    news: item,
    slides: slides.map((s) => ({
      ...s,
      media: resolveSlideMedia(s),
      imageUrl: resolveSlideMedia(s)[0]?.url ?? s.imageUrl ?? null,
    })),
  }
}

// Crée une news vide (brouillon non publié).
export async function createNews(title: string) {
  await ensureNewsSchema()
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
  await ensureNewsSchema()
  if (!newsId) return { ok: false as const }

  const media = sanitizeMedia(input.media)
  // Rétrocompat : si media vide mais imageUrl fourni, on le convertit.
  const resolved =
    media.length > 0
      ? media
      : input.imageUrl?.trim()
        ? resolveSlideMedia({ imageUrl: input.imageUrl, media: [] })
        : []
  const primaryUrl = resolved[0]?.url ?? null

  const values = {
    newsId,
    order: input.order ?? 0,
    title: input.title?.trim() || null,
    content: input.content ?? null,
    imageUrl: primaryUrl,
    media: resolved,
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

// Active/désactive une news individuellement (sans toucher les autres).
export async function toggleNewsActive(newsId: number, isActive: boolean) {
  if (!newsId) return { ok: false as const }
  await db
    .update(news)
    .set({ isActive, updatedAt: sql`now()` })
    .where(eq(news.id, newsId))
  revalidatePath("/admin")
  revalidatePath("/")
  return { ok: true as const }
}

// Met à jour l'ordre d'affichage d'une liste de news [{ id, sortOrder }].
export async function reorderNews(items: { id: number; sortOrder: number }[]) {
  if (!items.length) return { ok: true as const }
  for (const item of items) {
    await db.update(news).set({ sortOrder: item.sortOrder }).where(eq(news.id, item.id))
  }
  revalidatePath("/admin")
  revalidatePath("/")
  return { ok: true as const }
}

// Publie une news (active) et envoie une notification push.
// Réinitialise les lectures pour que tout le monde la revoie (y compris « ne plus afficher »).
export async function publishAndNotify(newsId: number) {
  if (!newsId) return { ok: false as const }
  const [item] = await db.select().from(news).where(eq(news.id, newsId))
  if (!item) return { ok: false as const }

  // Active cette news sans toucher les autres — plusieurs peuvent être actives simultanément.
  await db.update(news).set({ isActive: true, updatedAt: sql`now()` }).where(eq(news.id, newsId))
  await db.delete(userNewsReads).where(eq(userNewsReads.newsId, newsId))

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

// Renvoie les news actives non encore dismissées par ce client (ordre sortOrder).
export async function getActiveNewsForUser(userToken: string | null | undefined) {
  await ensureNewsSchema()
  const token = userToken?.trim()
  const active = await db
    .select()
    .from(news)
    .where(eq(news.isActive, true))
    .orderBy(asc(news.sortOrder), asc(news.createdAt))

  // Filtre les news déjà marquées « ne plus afficher » pour ce token.
  let dismissedIds = new Set<number>()
  if (token && active.length > 0) {
    const reads = await db
      .select({ newsId: userNewsReads.newsId })
      .from(userNewsReads)
      .where(
        and(
          eq(userNewsReads.userToken, token),
          inArray(
            userNewsReads.newsId,
            active.map((n) => n.id),
          ),
        ),
      )
    dismissedIds = new Set(reads.map((r) => r.newsId))
  }

  const visible = active.filter((n) => !dismissedIds.has(n.id))
  if (visible.length === 0) return null

  const result = []
  for (const item of visible) {
    const slides = await db
      .select()
      .from(newsSlides)
      .where(eq(newsSlides.newsId, item.id))
      .orderBy(asc(newsSlides.order), asc(newsSlides.id))

    // Si la news n'a aucun slide, on génère un slide par défaut basé sur son titre.
    if (slides.length === 0) {
      result.push({
        news: item,
        slides: [
          {
            id: -item.id,
            newsId: item.id,
            order: 0,
            title: item.title,
            content: null,
            imageUrl: null,
            media: [] as MediaAttachment[],
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
      })
      continue
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
        const media = resolveSlideMedia(s)
        return {
          ...s,
          media,
          imageUrl: media[0]?.url ?? s.imageUrl ?? null,
          promoUsed,
        }
      }),
    )
    result.push({ news: item, slides: slidesWithUsage })
  }
  return result.length > 0 ? result : null
}

// Marque une news comme « ne plus afficher » pour ce client.
export async function markNewsRead(userToken: string | null | undefined, newsId: number) {
  await ensureNewsSchema()
  const token = userToken?.trim()
  if (!token || !newsId) return { ok: false as const }
  const [existing] = await db
    .select({ id: userNewsReads.id })
    .from(userNewsReads)
    .where(and(eq(userNewsReads.userToken, token), eq(userNewsReads.newsId, newsId)))
    .limit(1)
  if (!existing) {
    await db.insert(userNewsReads).values({ userToken: token, newsId })
  }
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
