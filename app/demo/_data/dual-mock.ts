// Données fictives pour la démo dual-catalogue (Laboratoire / Fumoir).
// Aucune DB, aucune donnée réelle — purement conceptuel.

export type DualProduct = {
  id: number
  title: string
  symbol: string
  description: string
  image: string
  stock: number
  priceFrom: number
  badge?: string
}

export type DualVendor = {
  id: "labo" | "fumoir"
  name: string
  tagline: string
  subtitle: string
  iconSrc: string
  accent: string
  accentSoft: string
  borderActive: string
  products: DualProduct[]
}

export const DUAL_VENDORS: DualVendor[] = [
  {
    id: "labo",
    name: "Le Laboratoire",
    tagline: "Formule Heisenberg",
    subtitle: "Produits du labo principal — pureté & discrétion.",
    iconSrc: "/images/face.png",
    accent: "#3e6757",
    accentSoft: "rgba(62, 103, 87, 0.18)",
    borderActive: "border-[#3e6757]/60",
    products: [
      {
        id: 1,
        title: "Blue Sky Premium",
        symbol: "BS-P",
        description: "Formule phare du laboratoire. Pureté exceptionnelle.",
        image: "/images/logoapp.png",
        stock: 12,
        priceFrom: 15,
        badge: "Top",
      },
      {
        id: 2,
        title: "Crystal Reserve",
        symbol: "CR-X",
        description: "Édition limitée, batch mensuel très restreint.",
        image: "/images/blue-candle.png",
        stock: 4,
        priceFrom: 20,
        badge: "Exclusif",
      },
      {
        id: 3,
        title: "Heisenberg OG",
        symbol: "H-OG",
        description: "La signature. L'original, inchangé.",
        image: "/images/chemistry-set.png",
        stock: 8,
        priceFrom: 12,
        badge: "Signature",
      },
      {
        id: 4,
        title: "Los Pollos Extract",
        symbol: "LP-E",
        description: "Concentré technique, extraction à froid.",
        image: "/images/pollos-mug.png",
        stock: 6,
        priceFrom: 25,
      },
    ],
  },
  {
    id: "fumoir",
    name: "Le Fumoir",
    tagline: "Sélection Pinkman",
    subtitle: "Catalogue partenaire — ambiance street, stocks rotatifs.",
    iconSrc: "/images/jp.png",
    accent: "#c4784a",
    accentSoft: "rgba(196, 120, 74, 0.18)",
    borderActive: "border-[#c4784a]/60",
    products: [
      {
        id: 101,
        title: "Pinkman Special",
        symbol: "PM-S",
        description: "Le best-seller du Fumoir. Généreux et franc.",
        image: "/images/pins.png",
        stock: 15,
        priceFrom: 11,
        badge: "Hot",
      },
      {
        id: 102,
        title: "RV Road Blend",
        symbol: "RV-B",
        description: "Mélange voyage, parfait pour les sessions longues.",
        image: "/images/rv-pair.png",
        stock: 9,
        priceFrom: 14,
      },
      {
        id: 103,
        title: "Desert Dust",
        symbol: "DD-1",
        description: "Profil sec et intense. Stock tournant.",
        image: "/images/desert-flowers.png",
        stock: 3,
        priceFrom: 18,
        badge: "Limité",
      },
      {
        id: 104,
        title: "Cap'n Cook Classic",
        symbol: "CC-C",
        description: "Entrée de gamme du Fumoir, rapport qualité/prix.",
        image: "/images/black-mug.png",
        stock: 0,
        priceFrom: 9,
        badge: "Rupture",
      },
      {
        id: 105,
        title: "Yo! Extract",
        symbol: "YO-X",
        description: "Concentré maison, recipe secrète de l'équipe.",
        image: "/images/blobby.png",
        stock: 7,
        priceFrom: 22,
        badge: "Nouveau",
      },
    ],
  },
]
