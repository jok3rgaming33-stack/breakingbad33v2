import { pgTable, serial, text, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  pseudo: text("pseudo").notNull(),
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

export type User = typeof users.$inferSelect
export type OrderThread = typeof orderThreads.$inferSelect
export type ThreadMessage = typeof threadMessages.$inferSelect
export type ProductBadge = typeof productBadges.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
