# Fichiers à Copier — Ordre d'Implémentation

**Ce document liste les fichiers à copier et dans quel ordre les implémenter dans un nouveau projet.**

---

## 📋 Dépendances & Configuration

### 1. Setup Base
```bash
# Copier depuis le root du projet
- tsconfig.json
- next.config.js
- tailwind.config.ts
- postcss.config.js
- .eslintrc.json
```

### 2. Styles
```bash
# Copier
- styles/globals.css    (Tailwind + design tokens)
- public/favicon.ico
```

---

## 🗄️ Phase 1 : Database & Auth

### 3. Schema & Database
```bash
# COPIER
- lib/db/schema.ts          (⭐ CRUCIAL)
- lib/db/index.ts           (Helper queries)
- lib/admin-password.ts     (Gestion mot de passe admin)
- lib/user-flags.ts         (Types flags clients)
```

### 4. Actions Auth
```bash
# COPIER
- app/actions/account.ts      (Création compte, login utilisateur)
- app/actions/admin-auth.ts   (Login/logout admin)
```

### 5. Composants Auth
```bash
# COPIER
- components/login-page.tsx   (Formulaire connexion/création)
```

### 6. Layout Root
```bash
# COPIER
- app/layout.tsx              (Root layout + providers)
- app/page.tsx                (Page d'accueil)
```

---

## 🛍️ Phase 2 : Boutique & Produits

### 7. Actions Produits
```bash
# COPIER
- app/actions/products.ts       (CRUD produits)
- lib/badges.ts                 (Types badges)
```

### 8. Upload Images
```bash
# COPIER
- lib/upload-media.ts           (Helper upload Blob)
- app/api/products/upload/route.ts (Endpoint upload)
```

### 9. Composants Admin Produits
```bash
# COPIER
- components/admin-products.tsx (Éditeur produits)
- components/product-badge.tsx  (Affichage badges)
```

### 10. Composants Shop
```bash
# COPIER
- components/hero.tsx           (Section hero)
- components/product-section.tsx (Grille + modale détails)
```

---

## 🛒 Phase 3 : Panier & Commandes

### 11. Panier
```bash
# COPIER
- components/cart-provider.tsx  (Context panier)
- components/checkout-cart.tsx  (UI panier + validation)
```

### 12. Messagerie
```bash
# COPIER
- app/actions/messaging.ts         (CRUD threads + messages)
- components/messagerie-modal.tsx  (UI chat)
- components/my-orders-modal.tsx   (Onglet commandes)
```

### 13. Admin Commandes
```bash
# COPIER
- components/admin-orders-recap.tsx (Tableau commandes)
```

---

## 🎯 Phase 4 : Codes Promo & Fidélité

### 14. Codes Promo
```bash
# COPIER
- app/actions/promo.ts          (CRUD codes promo)
- components/admin-promos.tsx   (Éditeur codes)
```

### 15. Loyauté
```bash
# COPIER
- lib/loyalty.ts                (Calculs points)
- components/loyalty-modal.tsx  (Affichage points + génération codes)
```

---

## 📍 Phase 5 : Logistique

### 16. Créneaux
```bash
# COPIER
- app/actions/settings.ts           (getCartConfig, setCartConfig)
- components/admin-cart-settings.tsx (Éditeur créneaux)
```

### 17. Géolocalisation
```bash
# COPIER
- app/api/geocode/route.ts      (Proxy Google Geocode)
- components/admin-logistics.tsx (Modale livraison + map)
- components/admin-map.tsx       (Affichage carte clients)
```

### 18. Modales Info
```bash
# COPIER
- components/delivery-info-modal.tsx (Explications livraison)
```

---

## 📰 Phase 6 : Annonces & Notifications

### 19. News/Annonces
```bash
# COPIER
- app/actions/news.ts         (CRUD news + slides)
- components/admin-news.tsx   (Éditeur news)
- components/news-popup.tsx   (Popup client)
```

### 20. Push Notifications
```bash
# COPIER
- lib/push.ts                      (Web Push helpers)
- app/actions/push.ts              (Subscription management)
- components/push-toggle.tsx       (UI activation push)
- components/notification-bell.tsx (Cloche notifications)
- components/notifications-provider.tsx (Contexte push)
- public/sw.js                     (Service Worker)
- public/manifest.json             (PWA manifest)
```

---

## 👥 Phase 7 : Panel Admin

### 21. Admin Gate & Navigation
```bash
# COPIER
- components/admin-gate.tsx   (Gestion accès admin)
- components/admin-panel.tsx  (Navigation onglets)
```

### 22. Admin Utilisateurs
```bash
# COPIER
- components/admin-users.tsx  (Liste clients + contacter)
```

### 23. Admin Vérifications KYC
```bash
# COPIER
- app/actions/verification.ts (KYC logic)
- app/api/verification/upload/route.ts (Upload Blob)
- components/selfie-verification-modal.tsx (Capture photo/vidéo)
- components/admin-verifications.tsx (Validation admin)
```

### 24. Admin Admins & Sécurité
```bash
# COPIER
- app/actions/admins.ts              (Gestion admins)
- app/actions/admin-auth.ts          (Déjà copié phase 1)
- components/admin-admins.tsx        (Tableau admins)
```

---

## 🎨 Phase 8 : Interface Client Avancée

### 25. Modales Explications
```bash
# COPIER
- components/how-it-works-modal.tsx (Modale Comment ça marche)
```

### 26. Navigation
```bash
# COPIER
- components/navbar.tsx        (Navbar responsive)
- components/bb-logo.tsx       (Logo app)
```

---

## 🔒 Phase 9 : Sécurité Avancée

### 27. Turnstile CAPTCHA
```bash
# COPIER
- lib/turnstile.ts             (Validation Turnstile)
```

### 28. IP Checking
```bash
# COPIER
- lib/ip-check.ts              (Détection nouvelle IP)
```

### 29. Sécurité Supplémentaire
```bash
# COPIER
- app/actions/security.ts      (Checks sécurité)
- app/actions/restock.ts       (Alertes restockage)
```

---

## 📱 Phase 10 : Demo Mode (Optionnel)

### 30. Demo Protégée
```bash
# COPIER
- app/demo/actions.ts                 (Login protection démo)
- app/demo/layout.tsx                 (Démo layout)
- app/demo/_data/mock.ts              (Données fictives)
- app/demo/_components/demo-gate.tsx  (Page d'accueil démo)
- app/demo/_components/demo-shop.tsx  (Boutique démo)
- app/demo/_components/demo-admin.tsx (Admin démo)
- app/demo/page.tsx                   (Sélecteur vue)
```

---

## 🔧 Utilitaires

### 31. Helpers
```bash
# COPIER
- lib/utils.ts              (Fonctions utilitaires)
- lib/order-status.ts       (Statuts commande)
- app/manifest.ts           (PWA manifest config)
```

---

## 📑 Ordre d'Implémentation Recommandé

```
1. Setup base (config files, styles)
2. Database schema + auth
3. Produits + images
4. Panier + commandes
5. Codes promo + fidélité
6. Créneaux + logistique
7. News + notifications
8. Panel admin complet
9. Sécurité avancée
10. Demo (optionnel)
```

### Temps estimé par phase
- Phase 1-2 : 2-3 jours
- Phase 3-4 : 3-4 jours
- Phase 5-6 : 2-3 jours
- Phase 7 : 3-4 jours
- Phase 8-9 : 2-3 jours
- Phase 10 : 1-2 jours
- **Total : ~15-20 jours** pour un développeur expérimenté

---

## ✅ Checklist Copie Fichiers

**Auth & DB**
- [ ] schema.ts
- [ ] index.ts (db)
- [ ] account.ts
- [ ] admin-auth.ts
- [ ] login-page.tsx

**Produits**
- [ ] products.ts
- [ ] badges.ts
- [ ] admin-products.tsx
- [ ] product-section.tsx
- [ ] hero.tsx

**Panier**
- [ ] cart-provider.tsx
- [ ] checkout-cart.tsx
- [ ] messaging.ts
- [ ] messagerie-modal.tsx

**Promo & Fidélité**
- [ ] promo.ts
- [ ] loyalty.ts
- [ ] admin-promos.tsx
- [ ] loyalty-modal.tsx

**Logistique**
- [ ] settings.ts
- [ ] admin-cart-settings.tsx
- [ ] admin-logistics.tsx
- [ ] admin-map.tsx
- [ ] delivery-info-modal.tsx

**News & Push**
- [ ] news.ts
- [ ] admin-news.tsx
- [ ] news-popup.tsx
- [ ] push.ts
- [ ] push-toggle.tsx
- [ ] notification-bell.tsx
- [ ] notifications-provider.tsx

**Admin**
- [ ] admin-panel.tsx
- [ ] admin-gate.tsx
- [ ] admin-users.tsx
- [ ] admin-orders-recap.tsx
- [ ] admin-verifications.tsx
- [ ] verification.ts
- [ ] selfie-verification-modal.tsx
- [ ] admin-admins.tsx
- [ ] admins.ts

**Interface**
- [ ] navbar.tsx
- [ ] how-it-works-modal.tsx
- [ ] my-orders-modal.tsx

**Utilitaires**
- [ ] All lib files
- [ ] All API routes

---

**Fin — Prêt à intégrer ! 🚀**
