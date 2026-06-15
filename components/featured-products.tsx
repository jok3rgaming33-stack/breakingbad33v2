"use client"

import { useState, useEffect } from "react"
import { useCart } from "@/components/cart-provider"
import Image from "next/image"
import { FlaskConical, X as CloseIcon } from "lucide-react"

const PRODUCTS = [
  {
    title: "3m",
    price: 390,
    image: "/pdt/3m.png",
    description: "Composant de haute précision pour votre laboratoire.",
    fullDescription: "Cet élément '3m' est indispensable pour garantir la pureté de vos réactions. Flacons, béchers et réactifs de qualité premium. Stockage sécurisé recommandé.",
    symbol: "3m",
    number: "01",
  },
  {
    title: "bai",
    price: 49,
    image: "/pdt/bai.png",
    description: "Catalyseur essentiel pour des résultats parfaits.",
    fullDescription: "Le 'bai' agit comme un stabilisateur de premier choix dans le processus. Manipuler avec des gants de protection et une aération adéquate.",
    symbol: "Ba",
    number: "56",
  },
  {
    title: "D",
    price: 125,
    image: "/pdt/D.png",
    description: "Réactif purificateur de grade industriel.",
    fullDescription: "L'élément 'D' finalise la synthèse en apportant la touche signature de votre production. Détails exceptionnels et pureté garantie.",
    symbol: "D",
    number: "04",
  },
  {
    title: "X",
    price: 250,
    image: "/pdt/X.png",
    description: "Composé expérimental hautement classifié.",
    fullDescription: "L'élément 'X' est une nouveauté de synthèse extrêmement puissante. Son utilisation requiert une expertise avancée et un équipement de protection complet.",
    symbol: "X",
    number: "99",
  },
]

export function FeaturedProducts() {
  const { addToCart } = useCart()
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const openModal = (product: any) => {
    setSelectedProduct(product)
    setIsModalOpen(true)
    setIsAnimating(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setTimeout(() => {
      setSelectedProduct(null)
      setIsAnimating(false)
    }, 300)
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isModalOpen && isAnimating) {
      timer = setTimeout(() => {
        setIsAnimating(false)
      }, 4000)
    }
    return () => clearTimeout(timer)
  }, [isModalOpen, isAnimating])

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-20" id="featured">
        <div className="flex items-center gap-4 mb-16">
          <FlaskConical className="w-8 h-8 text-[#3e6757]" />
          <div>
            <p className="text-xs tracking-[0.3em] text-[#3e6757] uppercase">Laboratoire Clandestin</p>
            <h2 className="text-4xl font-light text-white tracking-tight">Éléments Essentiels</h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRODUCTS.map((product, index) => (
            <div
              key={index}
              onClick={() => openModal(product)}
              className="group bg-[#0a0a0a] border border-white/10 p-8 rounded-3xl hover:border-[#3e6757]/50 transition-all cursor-pointer flex flex-col items-center text-center"
            >
              <div className="relative h-48 w-48 mb-8">
                <Image src={product.image} alt={product.title} fill className="object-contain" />
              </div>
              <span className="text-[#3e6757] font-mono text-sm tracking-[0.2em] uppercase mb-2">{product.symbol}</span>
              <h3 className="text-2xl font-semibold text-white mb-3">{product.title}</h3>
              <p className="text-zinc-500 text-sm mb-6 flex-grow">{product.description}</p>
              <button className="w-full border border-white/10 py-3 rounded-full text-white text-sm hover:bg-white hover:text-black transition-colors">
                Voir les détails
              </button>
            </div>
          ))}
        </div>
      </section>

      {isModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={closeModal}>
          <div 
            className="relative w-full max-w-2xl rounded-3xl bg-[#0a0a0a] border border-white/10 overflow-hidden flex flex-col md:flex-row"
            onClick={e => e.stopPropagation()}
          >
            {/* Effet Fumée */}
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
                <Image src={selectedProduct.image} alt={selectedProduct.title} fill className="object-contain" />
               </div>
            </div>

            <div className="relative z-20 w-full md:w-1/2 p-12 flex flex-col justify-center">
              <span className="text-[#3e6757] font-mono text-xs tracking-[0.2em] uppercase mb-2">Code {selectedProduct.number}</span>
              <h3 className="text-4xl font-bold text-white mb-4">{selectedProduct.title}</h3>
              <p className="text-zinc-400 leading-relaxed mb-8">{selectedProduct.fullDescription}</p>
              
              <div className="text-2xl font-semibold text-white mb-6">{selectedProduct.price}€</div>

              <button 
                onClick={() => { addToCart(selectedProduct.title, selectedProduct.price); closeModal() }}
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
