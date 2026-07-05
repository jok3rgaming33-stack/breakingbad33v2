# Guide d'Intégration — BreakingBad33 Features

Ce guide explique comment intégrer les fonctionnalités de BreakingBad33 dans un autre site Next.js.

---

## 🚀 Démarrage Rapide

### 1. Stack Requis
```bash
npm install next@16 react@19 drizzle-orm@0.43+ neon postgres
npm install tailwindcss clsx date-fns geospatial
npm install @vercel/blob  # Storage images/vidéos
npm install swr           # Fetch + cache client
```

### 2. Variables d'Environnement

```bash
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/db"

# Storage (Vercel Blob)
BLOB_READ_WRITE_TOKEN="vercelBlob_xxxxx"

# Auth Admin
ADMIN_PASSWORD_HASH="$argon2id$v=19$m=65540,t=3,p=4$..."

# Push notifications
VAPID_PUBLIC_KEY="AAAA..."
VAPID_PRIVATE_KEY="..."

# Géolocalisation
GOOGLE_GEOCODE_API_KEY="AIzaSyD..."

# Turnstile CAPTCHA
NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."
TURNSTILE_SECRET_KEY="..."

# Demo
DEMO_PASSWORD="DEMOHWEB"
```

---

## 📦 Modules Clés à Implémenter

### A. Authentification (auth)

**Fichiers sources** :
- `app/actions/account.ts` — création compte, login logique
- `app/actions/admin-auth.ts` — login admin, validation password
- `components/login-page.tsx` — formulaire connexion

**À copier/adapter** :
```typescript
// 1. Créer table users (Neon)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  pseudo: text("pseudo").notNull(),
  loyaltyAdjustment: integer("loyalty_adjustment").default(0),
  flags: jsonb("flags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
})

// 2. Implémenter Server Actions
export async function createAccount(pseudo: string, ip: string) {
  // Vérifier IP (max 1/mois)
  // Générer token JWT
  // Insérer user
  // Retourner token
}

export async function loginAdmin(password: string) {
  // Comparer Argon2
  // Créer session httpOnly cookie
  // Retourner admin data
}
```

### B. Gestion Produits (Shop)

**Fichiers sources** :
- `app/actions/products.ts` — CRUD
- `components/admin-products.tsx` — formulaire édition
- `components/product-section.tsx` — grille affichage

**Schéma** :
```typescript
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  stock: integer("stock").default(0),
  variants: jsonb("variants").$type<ProductVariant[]>().default([]),
  badges: jsonb("badges").$type<string[]>().default([]),
  image: text("image"), // Vercel Blob URL
  media: jsonb("media").$type<ProductMedia[]>().default([]),
  discountType: text("discount_type"), // 'percent' | 'fixed'
  discountValue: integer("discount_value"),
})
```

**Intégration** :
1. Créer endpoints upload Blob (`/api/products/upload`)
2. Implémenter formulaire admin édition produits
3. Afficher grille produits avec filtrage variantes par stock
4. Intégrer sélection variante dans modale

### C. Panier & Commandes (Checkout)

**Fichiers sources** :
- `components/cart-provider.tsx` — Context panier
- `components/checkout-cart.tsx` — UI panier
- `app/actions/messaging.ts` — création commande (= thread)

**Logique clé** :
```typescript
// Context panier
const CartContext = createContext({
  items: [],           // { productId, variantIdx, quantity }
  addItem: (p,v,q) => {},
  removeItem: (productId) => {},
  clear: () => {},
})

// Au validé commande
async function placeOrder(cart, address, slot, promoCode) {
  // 1. Valider stock (qty × count <= stock)
  // 2. Calculer total (avec promo)
  // 3. Vérifier KYC if 1re commande
  // 4. Créer orderThread (= commande)
  // 5. Notifier push admin + client
  // 6. Vider panier
}
```

### D. Codes Promo & Fidélité

**Fichiers sources** :
- `app/actions/promo.ts` — validation codes
- `lib/loyalty.ts` — calculs points

**Tables** :
```typescript
export const promoCodes = pgTable("promo_codes", {
  code: text("code").unique(),
  type: text("type"), // 'percent' | 'fixed' | 'produit'
  value: integer("value"),
  minAmount: integer("min_amount"),
  active: boolean("active"),
})

export const loyaltyCodes = pgTable("loyalty_codes", {
  userToken: text("user_token"),
  code: text("code").unique(),
  discount: integer("discount"),
  pointsCost: integer("points_cost"),
  used: boolean("used"),
})
```

**Logique** :
```typescript
// Validation promo
async function validatePromoCode(code: string, subtotal: number) {
  const promo = await db.select().from(promoCodes)
    .where(and(eq(code), eq(true, active)))
  if (!promo || subtotal < promo.minAmount) return null
  return {
    discount: promo.type === 'percent' ? subtotal * promo.value / 100 : promo.value,
    appliedCode: code
  }
}

// Points accumulation
function calculateLoyaltyPoints(spent: number): number {
  return Math.floor(spent) // 1 point = 1€
}
```

### E. Logistique & Créneaux

**Fichiers sources** :
- `app/actions/settings.ts` — getCartConfig (créneaux)
- `components/admin-cart-settings.tsx` — édition créneaux
- `lib/db/schema.ts` — app_settings table

**Configuration** :
```typescript
export type CartConfig = {
  minDeliveryAmount: number
  deliverySlots: DeliverySlot[]     // { id, label, startHour, endHour }
  meetupSlots: MeetupSlot[]          // { id, label, hour }
}

// Stocké en JSON dans app_settings
async function getCartConfig(): Promise<CartConfig> {
  const setting = await readSetting("cart_config", DEFAULT_CONFIG)
  return setting
}
```

**Calcul distance + frais** :
```typescript
// Google Geocode conversion adresse → lat/lng
async function geocodeAddress(address: string) {
  const resp = await fetch('/api/geocode', { method: 'POST', body: { address } })
  return resp.json() // { lat, lng }
}

// Haversine distance
function haversineDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371 // km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * 
            Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Frais
function getDeliveryFee(distanceKm: number): number {
  return distanceKm <= 10 ? 10 : 20
}
```

### F. Vérification d'Identité (KYC)

**Fichiers sources** :
- `components/selfie-verification-modal.tsx` — capture photo/vidéo
- `app/actions/verification.ts` — sauvegarde Blob
- `components/admin-verifications.tsx` — validation admin

**Schéma** :
```typescript
export const userVerifications = pgTable("user_verifications", {
  userToken: text("user_token").unique(),
  photoPathname: text("photo_pathname"),
  videoPathname: text("video_pathname"),
  status: text("status"), // 'pending' | 'validated'
  validatedAt: timestamp("validated_at"),
})
```

**Logique** :
```typescript
// Capture + upload Vercel Blob
async function uploadKYCMedia(userToken: string, photo: Blob, video: Blob) {
  const photoPath = `kyc/${userToken}/photo.jpg`
  const videoPath = `kyc/${userToken}/video.mp4`
  
  await put(photoPath, photo, { access: 'private' })
  await put(videoPath, video, { access: 'private' })
  
  // Insérer dans DB
  await db.insert(userVerifications).values({
    userToken,
    photoPathname: photoPath,
    videoPathname: videoPath,
    status: 'pending',
  })
}

// Validation admin
async function validateKYC(userToken: string, approved: boolean) {
  if (approved) {
    // Marquer validated
    // Supprimer fichiers Blob (optionnel, peut garder 30j)
  } else {
    // Demander nouvelle vérification
  }
}
```

### G. Messagerie & Commandes

**Fichiers sources** :
- `app/actions/messaging.ts` — création thread, envoi messages
- `components/messagerie-modal.tsx` — UI chat

**Schéma** :
```typescript
export const orderThreads = pgTable("order_threads", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name"),
  customerToken: text("customer_token"),
  summary: text("summary"), // "3M x 2 = 90€"
  products: text("products"), // JSON stringifiée
  status: text("status"), // pending | confirmed | packed | ready | delivered
  orderDate: timestamp("order_date"),
})

export const orderThreadMessages = pgTable("order_thread_messages", {
  threadId: integer("thread_id").references(() => orderThreads.id),
  userToken: text("user_token"),
  message: text("message"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
})
```

**Logique** :
```typescript
// Création commande = création thread
async function createOrderThread(
  customerToken: string,
  customerName: string,
  items: CartItem[],
  total: number
) {
  const summary = `${items.length} produits = ${total}€`
  const products = JSON.stringify(items)
  
  const thread = await db.insert(orderThreads).values({
    customerToken,
    customerName,
    summary,
    products,
    status: 'pending',
    orderDate: new Date(),
  }).returning()
  
  // Notifier push
  await notifyPushAll('Nouvelle commande', `${customerName} : ${summary}`)
  
  return thread
}

// Envoi message
async function sendMessage(threadId: number, userToken: string, message: string) {
  await db.insert(orderThreadMessages).values({
    threadId,
    userToken,
    message,
  })
  
  // Notifier push destinataire
  const thread = await getOrderThread(threadId)
  const recipient = thread.customerToken === userToken ? 'admin' : thread.customerToken
  await notifyPush(recipient, 'Nouveau message', `Fil commande: ${message.slice(0,50)}…`)
}
```

### H. Notifications Push

**Fichiers sources** :
- `lib/push.ts` — subscription management
- `components/push-toggle.tsx` — UI activation
- `app/actions/push.ts` — envoi notifications

**Logique** :
```typescript
// 1. Générer VAPID keys (une fois)
const vapid = webpush.generateVAPIDKeys()
// Stocker env VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY

// 2. Client subscribe
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.register('/sw.js')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  })
  
  // Envoyer subscription au serveur
  await fetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription, userToken: getToken() })
  })
}

// 3. Admin envoie push
async function notifyPush(userToken: string, title: string, body: string) {
  const subscriptions = await db.select().from(pushSubscriptions)
    .where(eq(userToken))
  
  subscriptions.forEach(sub => {
    webpush.sendNotification(JSON.parse(sub.subscription), {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
    }).catch(err => console.error('Push failed:', err))
  })
}
```

### I. Annonces/News

**Fichiers sources** :
- `app/actions/news.ts` — CRUD news + slides
- `components/admin-news.tsx` — édition
- `components/news-popup.tsx` — affichage client

**Schéma** :
```typescript
export const news = pgTable("news", {
  id: serial("id").primaryKey(),
  title: text("title"),
  isActive: boolean("is_active").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const newsSlides = pgTable("news_slides", {
  id: serial("id").primaryKey(),
  newsId: integer("news_id").references(() => news.id),
  order: integer("order"),
  title: text("title"),
  content: text("content"),
  imageUrl: text("image_url"),
  buttonText: text("button_text"),
  buttonLink: text("button_link"),
  promoCode: text("promo_code"),
})
```

---

## 🔌 Points d'Intégration Courants

### 1. Ajouter un nouveau mode de paiement
```typescript
// Actuellement : paiement simulé (validation → confirmation)
// Pour Stripe :

async function createCheckoutSession(orderThread: OrderThread) {
  const session = await stripe.checkout.sessions.create({
    line_items: orderThread.products.map(p => ({
      price_data: { currency: 'eur', product_data: { name: p.title }, unit_amount: p.price },
      quantity: p.quantity,
    })),
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_URL}/success?threadId=${orderThread.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
    customer_email: email,
  })
  
  // Rediriger client vers session.url
  return session.url
}

// Webhook Stripe
export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  
  if (event.type === 'checkout.session.completed') {
    const threadId = event.data.object.metadata.threadId
    await db.update(orderThreads)
      .set({ status: 'confirmed', paidAt: new Date() })
      .where(eq(id, threadId))
  }
}
```

### 2. Ajouter archivage/soft-delete
```typescript
// Ajouter colonne deletedAt
export const users = pgTable("users", {
  // ... autres champs
  deletedAt: timestamp("deleted_at"),
})

// Soft-delete
async function softDeleteUser(userToken: string) {
  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(token, userToken))
}

// Filtrer actifs dans queries
const activeUsers = await db.select()
  .from(users)
  .where(isNull(deletedAt))
```

### 3. Importer produits en masse (CSV)
```typescript
import Papa from 'papaparse'

async function importProductsFromCSV(csvFile: File) {
  const text = await csvFile.text()
  const { data } = Papa.parse(text, { header: true })
  
  const products = data.map(row => ({
    title: row.title,
    stock: parseInt(row.stock),
    price: parseFloat(row.price),
    // ...
  }))
  
  await db.insert(products).values(products)
}
```

---

## ✅ Checklist d'Implémentation

- [ ] Setup Neon PostgreSQL + Drizzle ORM
- [ ] Setup Vercel Blob + env var
- [ ] Implémenter authentification (users table, login)
- [ ] Implémenter produits (CRUD, upload images)
- [ ] Implémenter panier (Context + localStorage)
- [ ] Implémenter codes promo
- [ ] Implémenter commandes (threads, messagerie)
- [ ] Implémenter KYC (selfie, Blob storage)
- [ ] Implémenter créneaux (settings, filtrage)
- [ ] Implémenter géolocalisation + frais livraison
- [ ] Implémenter push notifications (VAPID, subscriptions)
- [ ] Implémenter news/annonces
- [ ] Implémenter panel admin (tous onglets)
- [ ] Tester flow complet (création compte → commande → message → livraison)
- [ ] Déployer Vercel

---

**Fin du guide — Pour questions/détails, consulter les fichiers sources directement**
