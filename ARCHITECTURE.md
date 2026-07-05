# BreakingBad33 — Architecture Technique

---

## 📐 Structure du Projet

```
/app
  /actions              # Server Actions (mutations, queries)
    /account.ts        # Gestion compte utilisateur
    /admin-auth.ts     # Auth admin
    /admins.ts         # Gestion admins
    /messaging.ts      # Création/modification threads
    /products.ts       # CRUD produits
    /promo.ts          # Codes promo
    /news.ts           # News/annonces
    /settings.ts       # Paramètres app
    /verification.ts   # KYC selfie/vidéo
    /push.ts           # Notifications push
    /restock.ts        # Alertes restockage
    /security.ts       # Vérifications sécurité
  /api
    /geocode/route.ts  # Google Geocode proxy
    /products/upload   # Upload images Blob
    /verification/     # Upload KYC Blob
  /demo                # Demo sécurisée
  /layout.tsx          # Root layout, providers
  /page.tsx            # Page d'accueil
  
/components            # Composants React (Client + Server Components)
  /admin-panel.tsx     # Panel admin principal
  /admin-products.tsx  # CRUD produits
  /admin-users.tsx     # Gestion clients
  /admin-orders-recap.tsx # Tableau commandes
  /admin-news.tsx      # Gestion news
  /admin-logistics.tsx # Créneaux, map
  /checkout-cart.tsx   # Panier + paiement simulé
  /product-section.tsx # Grille produits
  /messagerie-modal.tsx # Fil messagerie
  /login-page.tsx      # Connexion/création compte
  /navbar.tsx          # Navigation
  /news-popup.tsx      # Popup annonces
  /notification-bell.tsx # Cloche notifications
  
/lib
  /db
    /schema.ts         # Drizzle ORM schema
    /index.ts          # Connexion, helpers queries
  /badges.ts           # Types et styles badges
  /loyalty.ts          # Calculs points fidélité
  /push.ts             # Web Push API helpers
  /user-flags.ts       # Types flags clients
  /ip-check.ts         # Validation IP
  /utils.ts            # Helpers génériques
  
/public                # Assets statiques
/styles                # Tailwind CSS globals
