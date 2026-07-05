# BreakingBad33 — Documentation Complète des Fonctionnalités

Date: Juillet 2026 | Stack: Next.js 16, React 19, Neon PostgreSQL, Drizzle ORM, Tailwind CSS, Vercel Blob

---

## 📊 Vue d'ensemble

BreakingBad33 est une **plateforme e-commerce B2C** complète avec système de fidélité, messagerie client, gestion logistique, vérification d'identité et panel admin avancé. Voir ARCHITECTURE.md pour l'overview technique.

---

## 🔐 AUTHENTIFICATION & SÉCURITÉ

### 1. **Système d'authentification utilisateur**
- **Token JWT opaque** unique par utilisateur (stocké en localStorage, non exposé côté client)
- **Création de compte** : pseudo + vérification d'unicité
- **Limite 1 compte par IP/mois** (enregistrement dans `accountCreations`)
- **Logout local** (suppression token localStorage)
- Aucune session serveur — **stateless**, scalable

### 2. **Authentification Admin**
- **Mot de passe admin unique** (hash Argon2 en env)
- **Cookies httpOnly sécurisés** (pas accessible JS)
- **Timeout 1h** auto-logout
- **Hiérarchie : Super-admin → Admin → (Subordonnés en phase 2)**
- Possible de revoquer l'accès d'autres admins depuis le panel

### 3. **Vérification d'identité (KYC)**
- **Selfie photo + vidéo** requis à la 1re commande
- **Stockage sécurisé Blob privé** (suppression auto après validation)
- **Statut** : pending → validated
- **Traçabilité** : pseudo, siteName (où vérifiée), timestamp
- **Check anti-fraude** : détection d'IP nouvelles, d'adresses email suspectes

### 4. **Sécurité supplémentaire**
- **Cloudflare Turnstile** (CAPTCHA) sur formulaires sensibles
- **Rate limiting IP** : max 3 tentatives de création compte/IP
- **Validation Webhook Vercel Blob** pour uploads fichiers
- **Sanitization inputs** (XSS) partout
- **Parameterized queries** SQL (Drizzle ORM)

---

## 🛍️ BOUTIQUE & PRODUITS

### 5. **Gestion des produits (Admin)**
- **Éditables depuis le panel** : titre, description longue, image principale, médias additionnels (images/vidéos), symbole, numéro
- **Stock** : quantité totale en unités
- **Variantes de prix** : quantité → prix (ex. 3G:15€, 5G:22€, 10G:40€)
- **Badges** : "Nouveau", "Promo", "Bientôt épuisé", "Rupture", "Bientôt dispo"
- **Réductions** : % / € fixe, cumulables avec codes promo
- **Catégories/Sections** : featured, categories éditables
- **Tri manuel** : sortOrder pour ordonner l'affichage
- **Upload images** : Vercel Blob (avec compression auto, CDN)
- **Filtrage côté boutique** : masque les variantes dont qty > stock

### 6. **Affichage produits (Client)**
- **Hero section** : image grande, nom, symbole/numéro, badges
- **Modale produit détaillée** : description longue, galerie médias (images swipables, vidéos lire en place)
- **Sélection variante** : dropdown quantité/prix
- **Panier côté client** : ajouter/retirer produits, quantité ajustable

### 7. **Gestion du panier**
- **Panier côté client** : stocké en React Context (cart-provider), persistant via localStorage
- **Sous-total auto** : somme des (quantité × prix variante) par produit
- **Codes promo** : appliquables, affichage réduction + montant final
- **Mode livraison vs meet-up** : toggle en 1 clic, frais différenciés
- **Dates/créneaux** : sélection date future, puis créneau horaire
- **Estimation frais livraison** : 10€ (≤10km), 20€ (>10km)
- **Vérification livraison minimum** : montant min 50€ (configurable admin)

---

## 🎯 CODES PROMO & FIDÉLITÉ

### 8. **Codes promo globaux (Admin)**
- **Création par l'admin** : code unique, type (% / € / produit gratuit), valeur, montant minimum
- **Activation/désactivation** : toggle actif/inactif
- **Partage client** : saisie dans le panier
- **Validation** : montant min, code unique, pas double-usage
- **Offres produit** : ex. "CODE123" = "GrammeOfferte" gratuite

### 9. **Programme de fidélité**
- **Accumulation points** : 1 point par € dépensé
- **Génération codes fidélité** : client dépense points → code réduction unique
- **Coût points** : admin règle prix des réductions en points (ex. 10€ = 100pts)
- **Montant minimum codes** : pour éviter les petites réductions
- **Historique** : points gagnés, dépensés, ajustement admin visible
- **Flagging clients** : "fidèle" / "suspect" / "absent" / "banni" avec impact sur fidélité

---

## 📦 COMMANDES & MESSAGERIE

### 10. **Création de commande**
- **Récapitulatif panier** : produits, variantes, sous-total, promo appliquée, frais livraison, total TTC
- **Sélection créneau** : date + heure (livraison 14-17h, 18-20h, 21-02h / meet-up 14h-23h)
- **Créneaux passés masqués** : si commande jour même à 18h, les créneaux avant 18h disparaissent
- **Vérification first-order** : redirection KYC si 1re commande
- **Validation finale** : création thread messagerie, notification push admin + client

### 11. **Statuts de commande**
- **Pending** : en attente d'admin
- **Confirmed** : admin a accepté
- **Packed** : emballage en cours
- **Ready** : prête à retrait/livraison
- **Delivered** : livrée
- **Cancelled** : annulée (refund points fidélité)

### 12. **Messagerie en temps réel**
- **Fil par commande** : client + admin échangent messages
- **Création automatique** : 1 fil = 1 commande
- **Messages marqués lus/non-lus** : statut visuel
- **Support général** : admin peut contacter client via bouton "Contacter" dans admin panel
- **Notifications push** : client/admin notifiés nouveau message (même app fermée)
- **Historique** : tous les messages persistés, consultables plus tard

### 13. **Onglet Mes commandes (Client)**
- **Liste des commandes** : date, montant, statut, créneau retrait/livraison
- **Détails dépliables** : produits, variantes, statut détaillé
- **Bouton messagerie** : ouvrir le fil d'échange

---

## 📍 LOGISTIQUE & CRÉNEAUX

### 14. **Gestion des créneaux (Admin)**
- **Créneaux de livraison** : heure début/fin (ex. 14-17h, 18-20h, 21-02h qui passe minuit)
- **Créneaux meet-up** : heure unique de retrait (14h, 15h, 16h… 23h, 00h)
- **Configuration** : ajout/modification/suppression depuis panel Logistique
- **Montant minimum livraison** : 50€ par défaut, modifiable
- **Stockage** : table `app_settings` clé/valeur

### 15. **Calcul des frais de livraison**
- **Géolocalisation client** : API Google Geocode (entrée adresse → lat/lng)
- **Distance calcul** : distance orthodromique (Haversine) depuis point de départ admin
- **Frais** : 10€ (≤10km), 20€ (>10km), 0€ meet-up
- **Affichage temps réel** : mise à jour au changement d'adresse dans le panier

### 16. **Carte logistique (Admin)**
- **Affichage géographique** : tous les clients, leurs commandes, distance au point de départ
- **Clustering** : pins groupées par zone, dépliables
- **Filtres** : par statut commande, date, montant, distance
- **Export** : données pour planning livraison (CSV/PDF en phase 2)

---

## 📰 ANNONCES & NOTIFICATIONS

### 17. **Système de news (Annonces)**
- **Admin crée annonces** : titre, slides (1+ par annonce)
- **Slide = contenu** : image, titre, description, boutons CTA optionnels, promo attachée
- **Boutons CTA** : applique code promo automatique quand cliqué
- **Badges promo** : "% OFF", "€ OFF", "Produit offert"
- **Publication** : brouillon → actif, activable/désactivable
- **Popup client** : affichage modal au chargement (1x par session), dismiss ×

### 18. **Notifications push**
- **Web Push API** : client accepte notifications, reçoit pushes même app fermée
- **Événements notifiés** : commande créée, statut change, nouveau message
- **Push Bell** : cloche dans navbar, affiche nombre notif non-lues
- **Activation mobile** : sur iOS, ajout écran d'accueil + Safari autorise push
- **Description explicite** : mention que notifications = mises à jour commande + messages

---

## 👥 PANEL ADMIN

### 19. **Dashboard admin**
- **KPIs** : CA/mois, nb commandes, avg panier, nb clients, taux vérification KYC
- **Graphiques** : ventes mois-à-mois, statuts commandes (pie chart), top produits
- **Activité récente** : dernières commandes, clients inscrits, messages

### 20. **Onglet Produits**
- CRUD complet : créer, lister, éditer, supprimer
- Éditeurs : titre, description, images/vidéos, stock, variantes, badges, réductions, tri
- Import en masse : CSV (phase 2)
- **Filtres** : par section, badge, stock (dispo/faible/rupture)

### 21. **Onglet Commandes**
- **Tableau tous les commandes** : date, client, montant, statut, créneau
- **Détails dépliables** : produits avec variantes, montant, adresse/créneau livraison
- **Changement statut** : pending → confirmed → packed → ready → delivered
- **Annulation** : remise points fidélité au client
- **Notes internes** : ajout notes priv sur commande
- **Recherche** : par pseudo client, date, montant

### 22. **Onglet Clients**
- **Liste utilisateurs** : pseudo, date inscription, nb commandes, montant total, statut (absent/fidèle/suspect/banni)
- **Points fidélité** : points gagnés, dépensés, ajustement manual
- **Flags** : application tags (fidèle/suspect/etc)
- **Bouton Contacter** : ouvre modale, envoi message client (crée fil messagerie)
- **Suppression** : soft-delete possible (phase 2)

### 23. **Onglet Messagerie**
- **Tous les fils** : liste des conversations
- **Détails fil** : historique messages, client/admin, statut lus
- **Envoi réponses** : envoyer message, notification push auto
- **Archivage** : marquer fil résolu (phase 2)

### 24. **Onglet News**
- **CRUD annonces** : créer, lister, éditer, supprimer
- **Éditeurs slide** : titre, contenu, image, bouton CTA + code promo
- **Publication** : brouillon → actif, activable immédiatement
- **Enregistrement auto-slides** : cliquer "Publier" enregistre titre + tous les slides d'un coup
- **Notification push broadcast** : "Nouvelle annonce !" envoyée à tous clients push-activés

### 25. **Onglet Codes promo**
- **Création codes** : code unique, type (% / €/ produit), montant min, activation
- **Listes** : actifs, utilisés, expirés (phase 2)
- **Édition** : modification code, montant, activation
- **Suppression** : soft-delete (phase 2)

### 26. **Onglet Paramètres**
- **Logo/branding** : nom site, couleurs (phase 2)
- **Créneaux livraison** : ajout/edit/suppression
- **Créneaux meet-up** : ajout/edit/suppression
- **Montant minimum livraison** : seuil 50€ (configurable)
- **Point de départ logistique** : adresse pour calcul distance
- **Contenu modal Livraison** : textes personnalisables
- **Notification webhook** : URL pour intégrations externes (phase 2)

### 27. **Onglet Vérifications**
- **KYC pending** : liste clients à vérifier (photo + vidéo)
- **Preview** : affichage photo/vidéo
- **Validation/rejet** : boutons pour accepter ou demander nouvelle vérification
- **Statut** : validation auto-conforme, ou requête humaine (phase 2)

### 28. **Onglet Admins**
- **Gestion équipe** : liste admins
- **Rôles** : super-admin, admin (complet), modérateur (commandes seulement) — phase 2
- **Ajout/suppression** : créer nouvel admin, revoquer accès
- **Historique actions** : log des modifications par admin (phase 2)

### 29. **Onglet Fidélité**
- **Historique points** : par client, montant, source (achat/ajustement/dépense)
- **Codes générés** : liste codes générés par client, utilisés/non-utilisés
- **Ajustement points** : ajout/retrait manual points

---

## 📱 VERSION DÉMO PROTÉGÉE

### 30. **Démo sécurisée**
- **Accès protégé** : mot de passe `DEMOHWEB` (configurable env)
- **Données fictives** : 5 produits mock, 3 clients mock, 10 commandes mock, conversations fake
- **Zéro contact DB** : données hardcodées, aucune vraie commande, aucun push réel
- **Sélecteur vue** : bouton flottant permute Client ↔ Admin
- **Bandeau "DÉMO"** : toujours visible, indique env test
- **URL** : `/demo` (non indexée, pas dans navigation)
- **Usage** : partage avec acheteurs potentiels via lien privé

---

## 🎨 INTERFACE CLIENT

### 31. **Pages mobiles responsives**
- **Navbar** : logo, menu burger (mobile), cart, notification bell, compte
- **Hero** : image grande, texte accroche, CTA commander
- **Produits grid** : images, badges, prix, ajout panier 1-clic
- **Modales** : fulscreen sur mobile, intérieures scrollables
- **Panier side** : slide-in depuis droite (desktop) ou modal (mobile)

### 32. **Modale "Comment ça marche"**
- **8 sections accordéon** : créer compte, commander, notifications, messagerie, livraison/meet-up, fidélité, mobile iOS, sécurité
- **Explications détaillées** : étapes numériques, screenshots (phase 2)
- **Accessible depuis** : navbar "Comment ça marche" (bouton encadré visible)

### 33. **Modale Livraison/Meet-up**
- **Explications livraison** : frais, délais, adresse de départ
- **Explications meet-up** : heures possibles, lieu, sans frais
- **Contenu personnalisable** : par l'admin depuis Paramètres

### 34. **Modale Loyauté**
- **Affichage points** : points gagnés, dépensés, solde, historique
- **Génération code** : sélectionner montant réduction, payer en points, copier code
- **Codes actifs** : liste mes codes inutilisés (date création, valeur, montant min)

---

## 🔧 UTILITAIRES & INTÉGRATIONS

### 35. **Upload fichiers**
- **Images** : JPEG/PNG/WebP, compression auto, CDN Vercel Blob
- **Vidéos** : MP4/WebM, stockage sécurisé
- **Limite taille** : images 5MB, vidéos 50MB
- **Suppression auto** : KYC videos après validation

### 36. **Géolocalisation**
- **Google Geocode API** : conversion adresse texte → lat/lng
- **Calcul distance** : Haversine (orthodromique, km)
- **Caching** : résultats mis en cache (phase 2)

### 37. **Notifications push**
- **Web Push API** : ServiceWorker, subscription tokens
- **Événements** : commande, message, annonce
- **Icônes personnalisées** : logo app, couleurs
- **Cibles** : tous clients push-activés

### 38. **Système de badges**
- **Types** : "Nouveau", "Promo", "Bientôt épuisé", "Rupture", "Bientôt dispo"
- **Affichage** : couleurs distinctes, icônes
- **Gestion** : librairie centralisée (badges.ts)

### 39. **Ordonnancement statuts commandes**
- **Pipeline** : pending → confirmed → packed → ready → delivered
- **Mapping** : statuts → labels FR, icônes, couleurs
- **Transitions** : vérification logique (ex. can't go back to pending)

### 40. **Système de flags clients**
- **Types** : "absent", "fidèle", "suspect", "banni"
- **Impact fidélité** : "banni" = pas de points achetés
- **Visibilité** : affichage dans tableau clients admin

---

## 🗄️ SCHÉMA BASE DE DONNÉES

**Tables principales** :
- `users` : token, pseudo, loyaltyAdjustment, loyaltySpent, flags
- `products` : titre, stock, variantes (JSON), badges, réduction
- `promo_codes` : code, type, value, minAmount, active
- `loyalty_codes` : userToken, code, discount, pointsCost, used
- `user_verifications` : photo/vidéo paths, status (pending/validated)
- `account_creations` : IP log (1/mois/IP limit)
- `order_threads` : customerName, summary, products, statut, messages
- `order_thread_messages` : userToken, message, timestamp, read
- `news` : title, is_active, updated_at
- `news_slides` : news_id, title, content, imageUrl, order, button/promo
- `push_subscriptions` : userToken, subscription JSON (endpoint, keys)
- `app_settings` : key/value (cart_config, logistics_content, etc)

---

## 🚀 STACK TECHNIQUE

- **Frontend** : Next.js 16 (App Router), React 19, Tailwind CSS, SWR
- **Backend** : Server Actions, Route Handlers, Node.js
- **Database** : Neon PostgreSQL, Drizzle ORM
- **Storage** : Vercel Blob (images, vidéos, KYC)
- **Notifications** : Web Push API, Service Workers
- **Auth** : JWT tokens (opaque), Argon2 hashing (admin)
- **Sécurité** : Turnstile CAPTCHA, rate limiting, input sanitization
- **Géolocalisation** : Google Geocode API
- **Déploiement** : Vercel (App Router, auto-scaling)

---

## 📋 CHECKLIST D'IMPLÉMENTATION POUR NOUVEAU SITE

### Phase 1 (MVP)
- [ ] Authentification utilisateur + admin
- [ ] Gestion produits + images
- [ ] Panier + codes promo
- [ ] Commandes + messagerie
- [ ] Créneaux livraison/meet-up
- [ ] KYC (selfie + vidéo)
- [ ] Dashboard admin basique
- [ ] Notifications push

### Phase 2 (Améliorations)
- [ ] Hiérarchie admin (rôles, modérateurs)
- [ ] Import produits en masse (CSV)
- [ ] Géolocalisation avancée + calcul distance
- [ ] Graphiques analytics + KPIs
- [ ] Export planning livraison (PDF)
- [ ] Archivage commandes/fils
- [ ] Soft-deletes utilisateurs
- [ ] Cache Redis (Upstash)

### Phase 3 (Premium)
- [ ] Abonnements (phase 2)
- [ ] Webhook intégrations externes
- [ ] Paiement en ligne (Stripe)
- [ ] API publique partenaires
- [ ] Chat temps réel avec socket.io
- [ ] Statistiques avancées

---

**Fin de la documentation — Dernière mise à jour : Juillet 2026**
