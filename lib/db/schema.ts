import { pgTable, serial, text, integer, doublePrecision, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core"

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
  // Surnom interne visible uniquement de l'admin, jamais exposé au client.
  nickname: text("nickname"),
  // Préférences d'envoi pilotées individuellement depuis l'onglet Utilisateurs.
  excludeNews: boolean("exclude_news").notNull().default(false),
  excludeNotifications: boolean("exclude_notifications").notNull().default(false),
  // Mot de passe provisoire envoyé par l'admin (hash, 6h de validité).
  // tempPasswordBlocked = true si la 6h est dépassée et la tentative signalée au vendeur.
  tempPasswordHash: text("temp_password_hash"),
  tempPasswordExpires: timestamp("temp_password_expires", { withTimezone: true }),
  tempPasswordBlocked: boolean("temp_password_blocked").notNull().default(false),
  // Rétablissement d'accès : token one-time envoyé par l'admin via notification push.
  // Le client se connecte avec ce token, puis est obligé de définir un nouveau mot de passe.
  accessRestoreToken: text("access_restore_token"),
  accessRestoreExpires: timestamp("access_restore_expires", { withTimezone: true }),
  mustSetPassword: boolean("must_set_password").notNull().default(false),
  // Parrainage : code unique du membre + token du parrain (si filleul)
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  referralBonusGranted: boolean("referral_bonus_granted").notNull().default(false),
  // Palier le plus haut atteint (ne redescend jamais, même si bons utilisés)
  peakTier: text("peak_tier").notNull().default("bronze"),
  // Livraison offerte Platine : fin de la fenêtre d'1 mois
  freeDeliveryUntil: timestamp("free_delivery_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Membres du staff créés par l'admin.
// can_admin = true  → accès panel vendeur (comme adminAccounts mais via lien d'invitation).
// can_admin = false → compte client étendu (customerToken lié à un row users).
// L'invite_token est le lien one-time d'onboarding ; invite_used le marque consommé.
export const staffMembers = pgTable("staff_members", {
  id: serial("id").primaryKey(),
  pseudo: text("pseudo"),
  passwordHash: text("password_hash"),
  inviteToken: text("invite_token").notNull().unique(),
  canAdmin: boolean("can_admin").notNull().default(false),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  inviteUsed: boolean("invite_used").notNull().default(false),
  active: boolean("active").notNull().default(true),
  customerToken: text("customer_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type StaffMember = typeof staffMembers.$inferSelect

// Identifiants WebAuthn (Face ID / empreinte / Windows Hello) pour déverrouillage rapide.
// La clé secrète reste le login principal ; la biométrie déverrouille le même compte sur cet appareil.
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userToken: text("user_token").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(), // base64url
  counter: integer("counter").notNull().default(0),
  transports: text("transports"), // CSV optionnel
  deviceLabel: text("device_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Challenges WebAuthn éphémères (registration / authentication), TTL court.
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  challenge: text("challenge").notNull(),
  userToken: text("user_token"),
  purpose: text("purpose").notNull(), // 'registration' | 'authentication'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect

// Variante de prix d'un produit (quantité -> prix).
export type ProductVariant = { qty: number; price: number }

// Média (image ou vidéo) réutilisé pour produits, news et notifications.
export type MediaAttachment = { type: "image" | "video"; url: string }
// Alias historique — les produits stockent le même format.
export type ProductMedia = MediaAttachment

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

// Registre permanent des pseudos utilisés ou supprimés.
// Un pseudo inscrit ici ne peut JAMAIS être repris par un autre compte, même après suppression.
// deletedAt = null signifie que le compte est actif (ligne insérée à la création, jamais retirée).
export const reservedPseudos = pgTable("reserved_pseudos", {
  id: serial("id").primaryKey(),
  pseudo: text("pseudo").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
})

export type ReservedPseudo = typeof reservedPseudos.$inferSelect

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
  // Tableau des IDs numériques de produits commandés — utilisé pour la notation post-livraison.
  productIds: jsonb("product_ids").$type<number[]>().notNull().default([]),
  colissimoNumber: text("colissimo_number"), // Numéro de suivi Colissimo/transporteur
  xmrWallet: text("xmr_wallet"),             // Adresse wallet XMR communiquée au client locker
  depositNotified: boolean("deposit_notified").notNull().default(false),   // Client a cliqué "j'ai déposé"
  depositConfirmed: boolean("deposit_confirmed").notNull().default(false),  // Admin a confirmé réception
  clientLastSeen: timestamp("client_last_seen", { withTimezone: true }),    // Dernière ouverture du fil par le client
  status: text("status").notNull().default("nouveau"),
  // Locker : mode de paiement — 'xmr' | 'paysafecard' (legacy: 'wiro') | null
  paymentMethod: text("payment_method"),
  // Réf. paiement libre (ex. code PSC noté côté admin) — colonne historique wiro_identifier
  wiroIdentifier: text("wiro_identifier"),
  // Paiement XMR (NOWPayments) — nullable = sans gateway / legacy
  paymentProvider: text("payment_provider"),
  paymentProviderId: text("payment_provider_id"),
  paymentStatus: text("payment_status"),
  paymentCrypto: text("payment_crypto"),
  paymentAmountCrypto: text("payment_amount_crypto"),
  paymentAmountEur: integer("payment_amount_eur"),
  paymentPayUrl: text("payment_pay_url"),
  paymentPayAddress: text("payment_pay_address"),
  // Rappels auto Locker (retrait en attente)
  lockerReminderCount: integer("locker_reminder_count").notNull().default(0),
  lockerLastReminderAt: timestamp("locker_last_reminder_at", { withTimezone: true }),
  // Remise fidélité appliquée (€) — pour CA qualifiant palier sans pénaliser le statut
  loyaltyDiscount: integer("loyalty_discount").notNull().default(0),
  // Points crédités à la livraison (avec multi palier) ; null = commande historique
  loyaltyPointsAwarded: integer("loyalty_points_awarded"),
  /** Historique des étapes + ETA (suivi graphique, plus de messages auto statut). */
  tracking: jsonb("tracking").$type<{
    history?: Record<string, string>
    etaMin?: number | null
    etaAt?: string | null
    etaArriveBy?: string | null
    cancelReason?: string | null
  }>().notNull().default({}),
  /** Lien Mode tournée (avance statut sans ouvrir le panel). */
  runToken: text("run_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const threadMessages = pgTable("thread_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  sender: text("sender").notNull(), // 'client' | 'vendeur'
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // null = message vendeur jamais lu par le client. Visible uniquement côté admin.
  clientReadAt: timestamp("client_read_at", { withTimezone: true }),
})

// Bandeaux produits posés par l'admin (best-seller / reappro / fin_de_stock).
// La clé produit est l'identifiant stable de la vignette (ex. "featured:3m").
export const productBadges = pgTable("product_badges", {
  productKey: text("product_key").primaryKey(),
  badge: text("badge").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Abonnements aux notifications push Web (Service Worker + VAPID).
// role = 'client' | 'vendeur' | 'both' (même appareil boutique + panel).
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
  // Ordre d'apparition lors de la connexion (0 = premier). Modifiable par drag-to-reorder.
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Slides d'une news. promoType = 'percent' | 'fixed' (€) | 'produit' (nb d'unités offertes).
// promoValue = valeur ; productName = produit offert (type 'produit').
// media = pièces jointes multiples (images/vidéos) ; imageUrl conservé pour rétrocompat (1er média).
export const newsSlides = pgTable("news_slides", {
  id: serial("id").primaryKey(),
  newsId: integer("news_id").notNull(),
  order: integer("order").notNull().default(0),
  title: text("title"),
  content: text("content"),
  imageUrl: text("image_url"),
  media: jsonb("media").$type<MediaAttachment[]>().notNull().default([]),
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
// Unique (userToken, newsId) pour onConflictDoNothing et filtre « ne plus afficher ».
export const userNewsReads = pgTable(
  "user_news_reads",
  {
    id: serial("id").primaryKey(),
    userToken: text("user_token").notNull(),
    newsId: integer("news_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_news_reads_user_token_news_id_idx").on(t.userToken, t.newsId)],
)

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

// Réservations Platine : sécurise 1 unité pendant 48 h.
export const productReservations = pgTable("product_reservations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  userToken: text("user_token").notNull(),
  // active | consumed | expired | cancelled
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type ProductReservation = typeof productReservations.$inferSelect

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
// loggedOutAt renseigné à la déconnexion explicite (bouton Déconnexion).
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
  loggedOutAt: timestamp("logged_out_at", { withTimezone: true }),
})

export type LoginLog = typeof loginLogs.$inferSelect

// Notifications broadcast envoyées par l'admin dans la messagerie de chaque destinataire.
// media = pièces jointes multiples ; imageUrl = 1er média image (payload push OS).
export const broadcastNotifications = pgTable("broadcast_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  media: jsonb("media").$type<MediaAttachment[]>().notNull().default([]),
  // 'all' | JSON array of customer tokens
  recipients: text("recipients").notNull().default("all"),
  sentCount: integer("sent_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type BroadcastNotification = typeof broadcastNotifications.$inferSelect

// Trace les lectures de notifications push par membre (pour suivi lu/non-lu dans l'admin).
export const notificationReads = pgTable(
  "notification_reads",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notification_id").notNull(),
    customerToken: text("customer_token").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    notifTokenUidx: uniqueIndex("notification_reads_notif_token_uidx").on(
      t.notificationId,
      t.customerToken,
    ),
  }),
)

export type NotificationRead = typeof notificationReads.$inferSelect

export type AdminAccount = typeof adminAccounts.$inferSelect
export type Category = typeof categories.$inferSelect
export type RestockAlert = typeof restockAlerts.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect

/**
 * Récupération de compte (clé perdue).
 * 1) Compte provisoire + fil messagerie
 * 2) KYC obligatoire
 * 3) Validation admin → fusion des données vers le compte d'origine
 *    (le token provisoire devient la nouvelle clé permanente)
 */
export const accountRecoveryClaims = pgTable("account_recovery_claims", {
  id: serial("id").primaryKey(),
  provisionalToken: text("provisional_token").notNull().unique(),
  claimedPseudo: text("claimed_pseudo").notNull(),
  originalUserId: integer("original_user_id"),
  threadId: integer("thread_id"),
  // pending_kyc | kyc_submitted | approved | rejected
  status: text("status").notNull().default("pending_kyc"),
  clientMessage: text("client_message"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
})

export type AccountRecoveryClaim = typeof accountRecoveryClaims.$inferSelect

// Avis clients sur les produits achetés.
// Seule une commande avec statut "livree" permet la notation.
// Un avis par produit ET par commande : le même produit peut être noté à chaque nouvelle livraison.
export const productRatings = pgTable("product_ratings", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  customerToken: text("customer_token").notNull(),
  threadId: integer("thread_id").notNull(),
  quality: integer("quality").notNull(),
  quantity: integer("quantity").notNull(),
  packaging: integer("packaging").notNull(),
  delivery: integer("delivery").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type ProductRating = typeof productRatings.$inferSelect
