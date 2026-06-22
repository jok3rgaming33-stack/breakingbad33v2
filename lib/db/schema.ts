import { pgTable, serial, text, integer, doublePrecision, timestamp, boolean } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  pseudo: text("pseudo").notNull(),
  // Ajustement manuel des points fidélité par le vendeur (peut être négatif).
  // Points affichés = points calculés sur les commandes + cet ajustement.
  loyaltyAdjustment: integer("loyalty_adjustment").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const orderThreads = pgTable("order_threads", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerToken: text("customer_token"),
  summary: text("summary").notNull(),
  products: text("products"),
  total: integer("total").notNull().default(0),
  fulfillment: text("fulfillment").notNull().default("livraison"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  scheduledDate: text("scheduled_date"),
  scheduledSlot: text("scheduled_slot"),
  status: text("status").notNull().default("nouveau"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const threadMessages = pgTable("thread_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  sender: text("sender").notNull(), // 'client' | 'vendeur'
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Bandeaux produits posés par l'admin (best-seller / reappro / fin_de_stock).
// La clé produit est l'identifiant stable de la vignette (ex. "featured:3m").
export const productBadges = pgTable("product_badges", {
  productKey: text("product_key").primaryKey(),
  badge: text("badge").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Abonnements aux notifications push Web (Service Worker + VAPID).
// role = 'client' (avec customer_token) ou 'vendeur' (notifications admin).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull().default("client"),
  customerToken: text("customer_token"),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// News / annonces affichées en popup carousel à l'entrée du site.
export const news = pgTable("news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Slides d'une news. promoType = 'percent' | 'fixed' (montant en €), promoValue = valeur.
export const newsSlides = pgTable("news_slides", {
  id: serial("id").primaryKey(),
  newsId: integer("news_id").notNull(),
  order: integer("order").notNull().default(0),
  title: text("title"),
  content: text("content"),
  imageUrl: text("image_url"),
  buttonText: text("button_text"),
  buttonLink: text("button_link"),
  promoCode: text("promo_code"),
  promoType: text("promo_type"),
  promoValue: integer("promo_value"),
  minAmount: integer("min_amount"),
  isSingleUse: boolean("is_single_use").notNull().default(true),
})

// Trace l'utilisation d'un code promo par un client (usage unique par token).
export const promoUsages = pgTable("promo_usages", {
  id: serial("id").primaryKey(),
  promoCode: text("promo_code").notNull(),
  userToken: text("user_token").notNull(),
  newsSlideId: integer("news_slide_id"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
})

// Trace les news déjà vues par un client (pour ne pas réafficher le popup).
export const userNewsReads = pgTable("user_news_reads", {
  id: serial("id").primaryKey(),
  userToken: text("user_token").notNull(),
  newsId: integer("news_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
})

export type News = typeof news.$inferSelect
export type NewsSlide = typeof newsSlides.$inferSelect
export type PromoUsage = typeof promoUsages.$inferSelect
export type UserNewsRead = typeof userNewsReads.$inferSelect

export type User = typeof users.$inferSelect
export type OrderThread = typeof orderThreads.$inferSelect
export type ThreadMessage = typeof threadMessages.$inferSelect
export type ProductBadge = typeof productBadges.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
