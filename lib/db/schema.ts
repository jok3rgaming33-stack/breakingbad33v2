import { pgTable, serial, text, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core"

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

export type OrderThread = typeof orderThreads.$inferSelect
export type ThreadMessage = typeof threadMessages.$inferSelect
