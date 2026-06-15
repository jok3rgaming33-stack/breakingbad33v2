"use client"

import { useState, useEffect } from "react"
import { useCart } from "@/components/cart-provider"
import { Sparkles, X as CloseIcon } from "lucide-react"
import Image from "next/image"

type PriceOption = {
  quantity: number
  price: number
}

type Arrival = {
  title: string
  price: number
  image: string
  alt: string
  symbol: string
  number: string
  description: string
  options?: PriceOption[] // ← Ajouté pour les produits avec plusieurs prix
}

const ARRIVALS: Arrival[] = [
  { 
    title: "cloud", 
    price: 35, 
    image: "/pdt/cloud.png", 
    alt: "Composé atmosphérique", 
    symbol: "Cl", 
    number: "17",
    description: "Catalyseur gazeux pour réactions en phase volatile."
  },
  { 
    title: "iron", 
    price: 45, 
    image: "/pdt/iron.png", 
    alt: "Base métallique", 
    symbol: "Fe", 
    number: "26",
    description: "Base structurelle renforcée pour synthèse complexe."
  },
  { 
    title: "K", 
    price: 55, 
    image: "/pdt/K.png", 
    alt: "Réactif alcalin", 
    symbol: "K", 
    number: "19",
    description: "Agent de réactivité pure, hautement instable."
  },
  { 
    title: "spee", 
    price: 65, 
    image: "/pdt/spee.png", 
    alt: "Accélérateur", 
    symbol: "Sp", 
    number: "08",
    description: "Accélérateur de processus moléculaire rapide."
  },
  { 
    title: "water", 
    price: 20, 
    image: "/pdt/water.png", 
    alt: "Solvant purifié", 
    symbol: "H2O", 
    number: "00",
    description: "Solvant universel de haute pureté analytique."
  },
  // === Produits avec menu déroulant ===
  {
    title: "3M",
    price: 30,
    image: "/pdt/3m.png",
    alt: "3M",
    symbol: "3M",
    number: "03",
    description: "Composé premium à concentration variable.",
    options: [
      { quantity: 1, price: 30 },
      { quantity: 3, price: 80 },
      { quantity: 5, price: 120 },
      { quantity: 10, price: 200 },
    ]
  },
  {
    title: "bai",
    price: 50,
    image: "/pdt/bai.png",
    alt: "bai",
    symbol: "BAI",
    number: "05",
    description: "Formule haut de gamme.",
    options: [
      { quantity: 1, price: 50 },
      { quantity: 5, price: 200 },
      { quantity: 10, price: 330 },
    ]
  },
  {
    title: "D",
    price: 30,
    image: "/pdt/d.png",
    alt: "D",
    symbol: "D",
    number: "04",
    description: "Produit de synthèse contrôlée.",
    options: [
      { quantity: 1, price: 30 },
      { quantity: 3, price: 80 },
      { quantity: 5, price: 120 },
      { quantity: 10, price: 200 },
    ]
  },
  {
    title: "X",
    price: 8,
    image: "/pdt/x.png",
    alt: "X",
    symbol: "X",
    number: "24",
    description: "Formule concentrée à petit dosage.",
    options: [
      { quantity: 1, price: 8 },
      { quantity: 5, price: 30 },
      { quantity: 10, price: 50 },
    ]
  },
]

export function NewArrivals() {
  const { addToCart } = useCart()
  const [selectedArrival, setSelectedArrival] = useState<Arrival | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [selectedOption, setSelectedOption] = useState<PriceOption | null>(null)

  const openModal = (arrival: Arrival) => {
    setSelectedArrival(arrival)
    setSelectedOption(arrival.options ? arrival.options[0] : null)
    setIsModalOpen(true)
    setIsAnimating(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setTimeout(() => {
      setSelectedArrival(null)
      setSelectedOption(null)
      setIsAnimating(false)
    }, 300)
  }

  const handleAddToCart = () => {
    if (!selectedArrival) return

    const price = selectedOption ? selectedOption.price : selectedArrival.price
    const quantity = selectedOption ? selectedOption.quantity : 1

    addToCart(selectedArrival.title, price, quantity)
    closeModal()
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isModalOpen && isAnimating) {
      timer = setTimeout(() => setIsAnimating(false), 4000)
    }
    return () => clearTimeout(timer)
  }, [isModalOpen, isAnimating])

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-20">
        <div className="flex items-center gap-4 mb-16">
          <Sparkles className="w-8 h-8 text-[#3e6757]" />
          <div>
            <p className="text-xs tracking-[0.3em] text-[#3e6757] uppercase">Nouvel Arrivage</p>
            <h2 className="text-4xl font-light text-white tracking-tight">Dernières Acquisitions</h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
          {ARRIVALS.map((arrival) => (
            <div
              key={arrival.title}
              onClick={() => openModal(arrival)}
              className="group bg-[#0a0a0a] border border-white/10 p-6 rounded-3xl hover:border-[#3e6757]/50 transition-all cursor-pointer flex flex-col items-center text-center"
            >
              <div className="relative h-32 w-32 mb-6">
                <Image src={arrival.image} alt={arrival.alt} fill className="object-contain" />
              </div>
              <span className="text-[#3e6757] font-mono text-xs tracking-[0.2em] uppercase mb-1">{arrival.symbol}</span>
              <h3 className="text-lg font-semibold text-white mb-2">{arrival.title}</h3>
              <p className="text-zinc-500 text-xs mb-4">{arrival.price}€</p>
              
              <button className="w-full border border-white/10 py-2 rounded-full text-white text-xs hover:bg-white hover:text-black transition-colors">
                Détails
              </button>
            </div>
          ))}
        </div>
      </section>

      {isModalOpen && selectedArrival && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={closeModal}>
          <div 
            className="relative w-full max-w-2xl rounded-3xl bg-[#0a0a0a] border border-white/10 overflow-hidden flex flex-col md:flex-row"
            onClick={e => e.stopPropagation()}
          >
            <div className={`absolute inset-0 pointer-events-none overflow-hidden transition-all duration-1000 ${isAnimating ? 'opacity-100 z-10' : 'opacity-10 z-0'}`}>
              <video 
                src="/images/CSS Smoke Effect/CSS Smoke Effect/smoke.mp4"
                autoPlay muted loop playsInline
                className="w-full h-full object-cover mix-blend-screen"
              />
            </div>

            <button onClick={closeModal} className="absolute top-6 right-6 z-50 text-white/50 hover:text-white">
              <CloseIcon className="w-6 h-6" />
            </button>

            <div className="relative z-20 w-full md:w-1/2 bg-[#050505]/50 flex items-center justify-center p-12">
              <div className="relative h-64 w-64">
                <Image src={selectedArrival.image} alt={selectedArrival.alt} fill className="object-contain" />
              </div>
            </div>

            <div className="relative z-20 w-full md:w-1/2 p-12 flex flex-col justify-center">
              <span className="text-[#3e6757] font-mono text-xs tracking-[0.2em] uppercase mb-2">Code {selectedArrival.number}</span>
              <h3 className="text-4xl font-bold text-white mb-4">{selectedArrival.title}</h3>
              <p className="text-zinc-400 leading-relaxed mb-8">
                {selectedArrival.description}
              </p>

              {/* === MENU DÉROULANT (uniquement si options existent) === */}
              {selectedArrival.options && (
                <div className="mb-6">
                  <label className="block text-sm text-zinc-400 mb-2">Quantité</label>
                  <select
                    value={selectedOption?.quantity}
                    onChange={(e) => {
                      const qty = parseInt(e.target.value)
                      const option = selectedArrival.options!.find(o => o.quantity === qty)
                      if (option) setSelectedOption(option)
                    }}
                    className="w-full bg-[#111] border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#3e6757]"
                  >
                    {selectedArrival.options.map((option) => (
                      <option key={option.quantity} value={option.quantity}>
                        {option.quantity} × — {option.price}€
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="text-2xl font-semibold text-white mb-6">
                {selectedOption ? selectedOption.price : selectedArrival.price}€
              </div>

              <button 
                onClick={handleAddToCart}
                className="w-full bg-[#3e6757] hover:bg-[#3e6757]/80 py-4 rounded-full text-white text-sm font-bold tracking-widest uppercase transition-all"
              >
                Ajouter au Laboratoire
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
