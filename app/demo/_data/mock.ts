// Toutes les données fictives de la démo — aucune DB, aucune donnée réelle.

export const DEMO_PRODUCTS = [
  {
    id: 1,
    title: "Blue Sky Premium",
    symbol: "BS-P",
    number: "99.1",
    description: "Notre produit phare, pureté exceptionnelle.",
    fullDescription:
      "Blue Sky Premium est notre formule exclusive, élaborée avec soin pour garantir une expérience sans compromis. Disponible en plusieurs formats adaptés à chaque profil.",
    image: "/images/logoapp.png",
    stock: 12,
    badges: ["top_seller"],
    section: "phares",
    variants: [
      { qty: "1g", price: 15 },
      { qty: "3.5g", price: 50 },
      { qty: "7g", price: 90 },
    ],
    discountType: null,
    discountValue: null,
  },
  {
    id: 2,
    title: "Crystal Reserve",
    symbol: "CR-X",
    number: "98.7",
    description: "Édition limitée, stock très restreint.",
    fullDescription:
      "Crystal Reserve est une sélection rarissime, produite en quantité limitée chaque mois. Pour les connaisseurs qui ne tolèrent pas la médiocrité.",
    image: "/images/logoapp.png",
    stock: 4,
    badges: ["exclusif", "bientot_dispo"],
    section: "phares",
    variants: [
      { qty: "1g", price: 20 },
      { qty: "3.5g", price: 65 },
    ],
    discountType: null,
    discountValue: null,
  },
  {
    id: 3,
    title: "Heisenberg OG",
    symbol: "H-OG",
    number: "97.4",
    description: "La signature. L'original.",
    fullDescription:
      "Heisenberg OG est la référence absolue. Rien n'a changé depuis la première batch — parce que la perfection ne se corrige pas.",
    image: "/images/logoapp.png",
    stock: 8,
    badges: ["top_seller", "nouveau"],
    section: "phares",
    variants: [
      { qty: "1g", price: 12 },
      { qty: "3.5g", price: 40 },
      { qty: "7g", price: 75 },
      { qty: "14g", price: 140 },
    ],
    discountType: "percent",
    discountValue: 10,
  },
  {
    id: 4,
    title: "Pinkman Blend",
    symbol: "PM-B",
    number: "96.2",
    description: "Entrée de gamme, rapport qualité/prix imbattable.",
    fullDescription:
      "Pinkman Blend est notre offre accessible. Ne vous fiez pas au prix — la qualité est là, simplement sans les fioritures des éditions premium.",
    image: "/images/logoapp.png",
    stock: 0,
    badges: ["rupture"],
    section: "concentres",
    variants: [
      { qty: "1g", price: 10 },
      { qty: "3.5g", price: 30 },
    ],
    discountType: null,
    discountValue: null,
  },
  {
    id: 5,
    title: "Los Pollos Extract",
    symbol: "LP-E",
    number: "99.8",
    description: "Concentré pur, extraction à froid.",
    fullDescription:
      "Los Pollos Extract est notre concentré technique. Extraction à froid, aucun résidu, profil aromatique intact. Pour les vrais amateurs.",
    image: "/images/logoapp.png",
    stock: 6,
    badges: ["exclusif"],
    section: "concentres",
    variants: [
      { qty: "0.5g", price: 25 },
      { qty: "1g", price: 45 },
    ],
    discountType: null,
    discountValue: null,
  },
]

export const DEMO_CLIENTS = [
  { id: 1, pseudo: "B•••dL•••x", token: "xxx-demo-1", phone: "06 •• •• •• ••", totalOrders: 7, totalSpent: 420, verified: true, createdAt: "2024-11-12" },
  { id: 2, pseudo: "D•••kW•••f", token: "xxx-demo-2", phone: "07 •• •• •• ••", totalOrders: 3, totalSpent: 150, verified: true, createdAt: "2024-12-01" },
  { id: 3, pseudo: "S•••yR•••s", token: "xxx-demo-3", phone: "06 •• •• •• ••", totalOrders: 12, totalSpent: 840, verified: true, createdAt: "2024-10-05" },
  { id: 4, pseudo: "M•••kG•••n", token: "xxx-demo-4", phone: "07 •• •• •• ••", totalOrders: 1, totalSpent: 40, verified: false, createdAt: "2025-01-20" },
  { id: 5, pseudo: "J•••eP•••s", token: "xxx-demo-5", phone: "06 •• •• •• ••", totalOrders: 5, totalSpent: 310, verified: true, createdAt: "2024-11-30" },
]

export const DEMO_ORDERS = [
  {
    id: 101,
    clientPseudo: "B•••dL•••x",
    items: [{ name: "Blue Sky Premium ×3.5g", price: 50 }, { name: "Heisenberg OG ×1g", price: 11 }],
    total: 61,
    status: "livré",
    type: "livraison",
    date: "2025-06-28",
    slot: "18H - 20H",
    address: "•• Rue de la Paix, Bordeaux",
  },
  {
    id: 102,
    clientPseudo: "S•••yR•••s",
    items: [{ name: "Crystal Reserve ×3.5g", price: 65 }, { name: "Los Pollos Extract ×1g", price: 45 }],
    total: 110,
    status: "en cours",
    type: "meet-up",
    date: "2025-06-29",
    slot: "20H",
    address: null,
  },
  {
    id: 103,
    clientPseudo: "D•••kW•••f",
    items: [{ name: "Heisenberg OG ×7g", price: 68 }],
    total: 68,
    status: "confirmé",
    type: "livraison",
    date: "2025-06-30",
    slot: "14H - 17H",
    address: "•• Avenue du Medoc, Bordeaux",
  },
  {
    id: 104,
    clientPseudo: "J•••eP•••s",
    items: [{ name: "Blue Sky Premium ×7g", price: 90 }],
    total: 100,
    status: "en attente",
    type: "meet-up",
    date: "2025-07-01",
    slot: "22H",
    address: null,
  },
  {
    id: 105,
    clientPseudo: "M•••kG•••n",
    items: [{ name: "Pinkman Blend ×1g", price: 10 }],
    total: 10,
    status: "annulé",
    type: "meet-up",
    date: "2025-06-25",
    slot: "19H",
    address: null,
  },
]

export const DEMO_MESSAGES = [
  {
    orderId: 101,
    clientPseudo: "B•••dL•••x",
    messages: [
      { from: "client", text: "Bonjour, je serai disponible à partir de 18h30.", time: "17:45" },
      { from: "admin", text: "Parfait, je serai là entre 18h30 et 19h.", time: "17:52" },
      { from: "client", text: "Super, merci !", time: "17:53" },
    ],
  },
  {
    orderId: 102,
    clientPseudo: "S•••yR•••s",
    messages: [
      { from: "client", text: "Quel est le point de meet-up ce soir ?", time: "19:10" },
      { from: "admin", text: "Place des Quinconces, côté fontaine. Je t'envoie le pin.", time: "19:12" },
    ],
  },
  {
    orderId: 103,
    clientPseudo: "D•••kW•••f",
    messages: [
      { from: "admin", text: "Commande confirmée, livraison demain 14h-17h.", time: "21:00" },
      { from: "client", text: "Reçu, merci.", time: "21:05" },
    ],
  },
]

export const DEMO_NEWS_SLIDES = [
  {
    id: 1,
    title: "Nouveau stock disponible",
    content: "Blue Sky Premium et Crystal Reserve viennent d'être réapprovisionnés. Profitez-en avant rupture.",
    imageUrl: null,
    promoCode: "BLUSKY10",
    promoType: "percent",
    promoValue: 10,
    promoLabel: "-10%",
    buttonText: "Voir les produits",
    buttonLink: "#phares",
  },
  {
    id: 2,
    title: "Alerte disponibilité",
    content: "Tu veux être averti(e) quand notre stock est réapprovisionné ? Active l'alerte sur la fiche produit.",
    imageUrl: null,
    promoCode: null,
    promoType: null,
    promoValue: null,
    promoLabel: null,
    buttonText: null,
    buttonLink: null,
  },
]

export const DEMO_STATS = {
  totalOrders: 47,
  totalRevenue: 2840,
  activeClients: 18,
  pendingOrders: 3,
  topProduct: "Blue Sky Premium",
  weeklyGrowth: "+12%",
}
