// Données fictives dual-catalogue — structure proche des vrais produits boutique.

export type DualVariant = { qty: string; price: number }

export type DualProduct = {
  id: number
  title: string
  description: string
  image: string
  stock: number
  badges: string[]
  variants: DualVariant[]
}

export type DualVendor = {
  id: "labo" | "fumoir"
  name: string
  label: string
  iconSrc: string
  sections: {
    eyebrow: string
    title: string
    icon: "flask" | "sparkles"
    anchor?: string
    products: DualProduct[]
  }[]
}

export const DUAL_VENDORS: DualVendor[] = [
  {
    id: "labo",
    name: "Le Laboratoire",
    label: "Formule Heisenberg",
    iconSrc: "/images/face.png",
    sections: [
      {
        eyebrow: "Laboratoire Clandestin",
        title: "Produits Phares",
        icon: "flask",
        anchor: "featured",
        products: [
          {
            id: 1,
            title: "Blue Sky Premium",
            description: "Formule phare du laboratoire.",
            image: "/images/logoapp.png",
            stock: 12,
            badges: ["best_seller"],
            variants: [
              { qty: "1g", price: 15 },
              { qty: "3.5g", price: 50 },
              { qty: "7g", price: 90 },
            ],
          },
          {
            id: 2,
            title: "Crystal Reserve",
            description: "Édition limitée, batch mensuel.",
            image: "/images/blue-candle.png",
            stock: 4,
            badges: ["arrivage"],
            variants: [
              { qty: "1g", price: 20 },
              { qty: "3.5g", price: 65 },
            ],
          },
          {
            id: 3,
            title: "Heisenberg OG",
            description: "La signature. L'original.",
            image: "/images/chemistry-set.png",
            stock: 8,
            badges: ["nouveau", "best_seller"],
            variants: [
              { qty: "1g", price: 12 },
              { qty: "3.5g", price: 40 },
              { qty: "7g", price: 75 },
              { qty: "14g", price: 140 },
            ],
          },
          {
            id: 4,
            title: "RV Keychain Pack",
            description: "Accessoire collector du labo.",
            image: "/images/rv-keychain.png",
            stock: 10,
            badges: [],
            variants: [
              { qty: "1", price: 25 },
              { qty: "2", price: 45 },
            ],
          },
        ],
      },
      {
        eyebrow: "Sélection",
        title: "Concentrés",
        icon: "sparkles",
        products: [
          {
            id: 5,
            title: "Los Pollos Extract",
            description: "Concentré technique, extraction à froid.",
            image: "/images/pollos-mug.png",
            stock: 6,
            badges: [],
            variants: [
              { qty: "0.5g", price: 25 },
              { qty: "1g", price: 45 },
            ],
          },
          {
            id: 6,
            title: "Pinkman Blend",
            description: "Entrée de gamme labo.",
            image: "/images/black-mug.png",
            stock: 0,
            badges: ["rupture"],
            variants: [
              { qty: "1g", price: 10 },
              { qty: "3.5g", price: 30 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fumoir",
    name: "Le Fumoir",
    label: "Sélection Pinkman",
    iconSrc: "/images/jp.png",
    sections: [
      {
        eyebrow: "Coin Fumoir",
        title: "Sélection du jour",
        icon: "flask",
        anchor: "featured",
        products: [
          {
            id: 101,
            title: "Pinkman Special",
            description: "Best-seller du Fumoir.",
            image: "/images/pins.png",
            stock: 15,
            badges: ["best_seller"],
            variants: [
              { qty: "1g", price: 11 },
              { qty: "3.5g", price: 35 },
              { qty: "7g", price: 65 },
            ],
          },
          {
            id: 102,
            title: "RV Road Blend",
            description: "Mélange voyage, sessions longues.",
            image: "/images/rv-pair.png",
            stock: 9,
            badges: ["nouveau"],
            variants: [
              { qty: "1g", price: 14 },
              { qty: "3.5g", price: 45 },
            ],
          },
          {
            id: 103,
            title: "Desert Dust",
            description: "Profil sec et intense.",
            image: "/images/desert-flowers.png",
            stock: 3,
            badges: ["arrivage"],
            variants: [
              { qty: "1g", price: 18 },
              { qty: "3.5g", price: 55 },
            ],
          },
          {
            id: 104,
            title: "Cap'n Cook Classic",
            description: "Entrée de gamme Fumoir.",
            image: "/images/black-mug.png",
            stock: 0,
            badges: ["rupture"],
            variants: [
              { qty: "1g", price: 9 },
              { qty: "3.5g", price: 28 },
            ],
          },
        ],
      },
      {
        eyebrow: "Spécialités",
        title: "Extraits maison",
        icon: "sparkles",
        products: [
          {
            id: 105,
            title: "Yo! Extract",
            description: "Concentré maison, recipe secrète.",
            image: "/images/blobby.png",
            stock: 7,
            badges: ["nouveau"],
            variants: [
              { qty: "0.5g", price: 22 },
              { qty: "1g", price: 40 },
            ],
          },
          {
            id: 106,
            title: "Lobby Gold",
            description: "Edition limitée du fumoir.",
            image: "/images/lobby.png",
            stock: 5,
            badges: [],
            variants: [
              { qty: "1g", price: 16 },
              { qty: "3.5g", price: 48 },
            ],
          },
        ],
      },
    ],
  },
]
