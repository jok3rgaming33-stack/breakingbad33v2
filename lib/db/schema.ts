import { pgTable, serial, text, integer, doublePrecision, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  pseudo: text("pseudo").notNull(),
  // Ajustement manuel des points fidélité par le vendeur (peut être négatif).
  // Points affichés = points calculés sur les commandes + cet ajustement - dépensés.
  loyaltyAdjustment: integer("loyalty_adjustment").notNull().default(0),
  // Points déjà consommés par la génération de codes de réduction.
  loyaltySpent: integer("loyalty_spent").notNull().default(0),
  // Étiquettes posées par l'admin : 'absent' | 'suspect' | 'fidele' | 'banni'.
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Variante de prix d'un produit (quantité -> prix).
export type ProductVariant = { qty: number; price: number }

// Média additionnel d'un produit (image ou vidéo importée).
export type ProductMedia = { type: "image" | "video"; url: string }

// Produits de la boutique, éditables depuis le panel admin.
// section = clé de catégorie (voir table categories).
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  section: text("section").notNull().default("featured"),
  image: text("image"),
  media: jsonb("media").$type<ProductMedia[]>().notNull().default([]),
  symbol: text("symbol"),
  number: text("number"),
  description: text("description"),
  fullDescription: text("full_description"),
  stock: integer("stock").notNull().default(0),
  variants: jsonb("variants").$type<ProductVariant[]>().notNull().default([]),
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  discountType: text("discount_type"), // 'percent' | 'fixed' | null
  discountValue: integer("discount_value"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Codes promo globaux créés par l'admin (saisissables dans le panier).
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("fixed"), // 'percent' | 'fixed' | 'produit'
  value: integer("value").notNull().default(0), // % / € / nombre de produits offerts
  productName: text("product_name"), // nom du produit offert (type 'produit')
  minAmount: integer("min_amount").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Codes de fidélité générés par un client (points réellement débités, usage unique).
export const loyaltyCodes = pgTable("loyalty_codes", {
  id: serial("id").primaryKey(),
  userToken: text("user_token").notNull(),
  code: text("code").notNull().unique(),
  discount: integer("discount").notNull(),
  pointsCost: integer("points_cost").notNull(),
  minAmount: integer("min_amount").notNull().default(0),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Vérification d'identité (selfie photo + vidéo) exigée à la 1re commande.
// Les fichiers sont stockés dans un Blob privé ; supprimés après validation.
export const userVerifications = pgTable("user_verifications", {
  id: serial("id").primaryKey(),
  userToken: text("user_token").notNull().unique(),
  pseudo: text("pseudo"),
  photoPathname: text("photo_pathname"),
  videoPathname: text("video_pathname"),
  siteName: text("site_name"),
  recordedAt: text("recorded_at"),
  status: text("status").notNull().default("pending"), // 'pending' | 'validated'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
})

// Journal des créations de compte par IP (limite 1/mois/IP, conservé même après suppression).
export const accountCreations = pgTable("account_creations", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type Product = typeof products.$inferSelect
export type PromoCode = typeof promoCodes.$inferSelect
export type LoyaltyCode = typeof loyaltyCodes.$inferSelect
export type UserVerification = typeof userVerifications.$inferSelect

export const orderThreads = pgTable("order_threads", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerToken: text("customer_token"),
  trackingToken: text("tracking_token").notNull().unique(), // Token de suivi unique pour chaque commande
  summary: text("summary").notNull(),
  products: text("products"),
  total: integer("total").notNull().default(0),
  fulfillment: text("fulfillment").notNull().default("livraison"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  scheduledDate: text("scheduled_date"),
  scheduledSlot: text("scheduled_slot"),
  colissimoNumber: text("colissimo_number"), // Numéro de suivi Colissimo/transporteur
  xmrWallet: text("xmr_wallet"),             // Adresse wallet XMR communiquée au client locker
  depositNotified: boolean("deposit_notified").notNull().default(false),   // Client a cliqué "j'ai déposé"
  depositConfirmed: boolean("deposit_confirmed").notNull().default(false),  // Admin a confirmé réception
  clientLastSeen: timestamp("client_last_seen", { withTimezone: true }),    // Dernière ouverture du fil par le client
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

// Slides d'une news. promoType = 'percent' | 'fixed' (€) | 'produit' (nb d'unités offertes).
// promoValue = valeur ; productName = produit offert (type 'produit').
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
  productName: text("product_name"),
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

// Comptes admin (gestion à plusieurs). passwordHash optionnel (token recommandé).
export const adminAccounts = pgTable("admin_accounts", {
  id: serial("id").primaryKey(),
  pseudo: text("pseudo").notNull(),
  token: text("token").notNull().unique(),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Catégories de produits dynamiques (créées/renommées/réordonnées par l'admin).
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Demandes d'alerte de disponibilité : notifier le client au réapprovisionnement.
export const restockAlerts = pgTable("restock_alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  userToken: text("user_token").notNull(),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Réglages applicatifs clé/valeur (point de départ carte, contenu modale logistique).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Prix d'achat (coût) par produit — saisie admin pour le calcul des bénéfices.
export const productCosts = pgTable("product_costs", {
  productId: integer("product_id").primaryKey(),
  costPrice: doublePrecision("cost_price").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type ProductCost = typeof productCosts.$inferSelect

// Journal des connexions client (enregistré à chaque getAccount validé).
export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  userToken: text("user_token").notNull(),
  pseudo: text("pseudo").notNull(),
  ip: text("ip"),
  city: text("city"),
  country: text("country"),
  countryCode: text("country_code"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type LoginLog = typeof loginLogs.$inferSelect

export type AdminAccount = typeof adminAccounts.$inferSelect
export type Category = typeof categories.$inferSelect
export type RestockAlert = typeof restockAlerts.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
