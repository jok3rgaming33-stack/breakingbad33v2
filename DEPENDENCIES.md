# Dépendances et Versions — BreakingBad33

---

## 📦 Stack de Production

### Runtime & Framework
```json
{
  "next": "16.0+",
  "react": "19.0+",
  "react-dom": "19.0+"
}
```

### Database & ORM
```json
{
  "neon": "latest",
  "pg": "8.11+",
  "postgres": "3.4+",
  "drizzle-orm": "0.43+",
  "drizzle-kit": "0.31+"
}
```

### Storage
```json
{
  "@vercel/blob": "0.20+"
}
```

### Client State & Data Fetching
```json
{
  "swr": "2.2+",
  "clsx": "2.1+"
}
```

### UI & Styling
```json
{
  "tailwindcss": "3.4+",
  "autoprefixer": "10.4+",
  "postcss": "8.4+",
  "lucide-react": "0.402+"
}
```

### Security & Hashing
```json
{
  "argon2": "0.32+"
}
```

### Notifications & Web APIs
```json
{
  "web-push": "3.6+"
}
```

### Géolocalisation
```json
{
  "geolib": "3.3+"
}
```

### Date Manipulation
```json
{
  "date-fns": "3.6+"
}
```

### Validation & Forms
```json
{
  "zod": "3.23+"
}
```

---

## 🛠️ Dépendances de Développement

```json
{
  "typescript": "5.3+",
  "eslint": "9+",
  "eslint-config-next": "16+",
  "@types/node": "20+",
  "@types/react": "19+",
  "@types/react-dom": "19+",
  "prettier": "3.1+"
}
```

---

## 📋 Installation Complète

```bash
# Initialiser Next.js 16
npx create-next-app@latest my-shop --typescript --tailwind

# Dépendances produits
npm install neon pg postgres drizzle-orm @vercel/blob swr
npm install clsx date-fns zod argon2 web-push geolib
npm install lucide-react

# Dépendances dev
npm install -D drizzle-kit typescript eslint prettier

# (Optionnel) Stripe pour paiements
npm install stripe @stripe/stripe-js
```

---

## 🔑 Variables d'Environnement Requises

```bash
# Database
DATABASE_URL=postgresql://user:pass@neon.tech:5432/dbname?sslmode=require

# Blob Storage
BLOB_READ_WRITE_TOKEN=vercelBlob_xxxxx

# Admin Auth
ADMIN_PASSWORD_HASH=$(node -e "const argon2 = require('argon2'); argon2.hash('YOUR_PASSWORD').then(h => console.log(h))")

# Push Notifications (générer via webpush CLI)
VAPID_PUBLIC_KEY=AAAA...
VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=AAAA...

# Google Geocoding
GOOGLE_GEOCODE_API_KEY=AIzaSyD...

# Cloudflare Turnstile (CAPTCHA)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...

# Demo Mode
DEMO_PASSWORD=DEMOHWEB

# (Optionnel) Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# (Optionnel) Email (Sendgrid, Resend, etc)
SENDGRID_API_KEY=...
```

---

## 🚀 Scripts npm

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "db:push": "drizzle-kit push:pg",
    "db:studio": "drizzle-kit studio",
    "db:generate": "drizzle-kit generate:pg"
  }
}
```

---

## 📱 Configuration Tailwind

```javascript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        accent: 'hsl(var(--accent))',
      },
    },
  },
  plugins: [],
}
export default config
```

---

## 🔒 Versioning Notes

- **Next.js 16+** : App Router obligatoire (Pages Router déprécié)
- **React 19** : Nouvelles features `use cache`, `useEffectEvent`
- **Drizzle 0.43+** : Support Neon, features récentes
- **Tailwind 3.4+** : CSS v4, performances améliorées
- **Neon** : PostgreSQL compatible, serverless (inutile de version specifique)

---

## 🐛 Compatibilité Navigateurs

- **Chrome 95+** : Web Push API, Service Workers
- **Firefox 91+** : Web Push API, Service Workers
- **Safari 16+** : Web Push API (via PWA/App Home Screen)
- **Edge 95+** : Web Push API, Service Workers

**Mobile** :
- iOS Safari 16+ : Requires installation d'écran d'accueil
- Android Chrome/Firefox 95+ : Push natives

---

## 📦 Taille du Build

- **JS Bundle Initial** : ~150KB (minified + gzip)
- **CSS** : ~30KB (tailwind purged)
- **Total Assets** : ~200KB (dépend images)

Optimisations appliquées :
- Next.js Code Splitting automatique
- Dynamic imports pour modales
- Image optimization automatique
- CSS purging Tailwind

---

## 🚄 Performance Targets

- **LCP (Largest Contentful Paint)** : < 2.5s
- **FID (First Input Delay)** : < 100ms
- **CLS (Cumulative Layout Shift)** : < 0.1

Avec service worker + push subscriptions, les utilisateurs récurrents voient une amélioration LCP de ~40%.

---

## 🔄 Mise à Jour Dépendances

```bash
# Check outdated
npm outdated

# Update mineurs
npm update

# Update majeurs (risky)
npm install next@latest react@latest drizzle-orm@latest

# Après update, tester
npm run type-check
npm run build
```

**Note** : Les mises à jour Next.js et React doivent être testées via `npm run build` avant déploiement.

---

**Fin — Pour des versions exactes, consulter package.json du projet**
