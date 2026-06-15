"use client"

import { useEffect, useState } from "react"
import { X as CloseIcon, Truck, Store, MapPin, Clock, BadgeEuro } from "lucide-react"

type DeliveryInfoModalProps = {
  isOpen: boolean
  onClose: () => void
}

const DELIVERY_SLOTS = ["14H - 17H", "18H - 20H", "21H - 02H"]
const MEETUP_HOURS = ["14H", "15H", "16H", "17H", "18H", "19H", "20H", "21H", "22H", "23H", "00H"]

export function DeliveryInfoModal({ isOpen, onClose }: DeliveryInfoModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Informations Livraison et Meet-up"
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Effet Fumée */}
        <div
          className={`pointer-events-none absolute inset-0 overflow-hidden transition-all duration-1000 ${
            isAnimating ? "opacity-60" : "opacity-10"
          }`}
        >
          <video
            src="/images/CSS Smoke Effect/CSS Smoke Effect/smoke.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover mix-blend-screen"
          />
        </div>

        <button
          onClick={onClose}
          className="absolute right-6 top-6 z-50 text-white/50 transition-colors hover:text-white"
          aria-label="Fermer"
        >
          <CloseIcon className="h-6 w-6" />
        </button>

        <div className="relative z-20 overflow-y-auto p-8 md:p-12">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-[#3e6757]">Logistique</span>
          <h2 className="mb-8 mt-2 text-balance text-4xl font-bold text-white">Livraison & Meet-up</h2>

          {/* Livraison */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-[#050505]/60 p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3e6757]/20 text-[#3e6757]">
                <Truck className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-xl font-semibold text-white">Livraison à domicile</h3>
            </div>

            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <BadgeEuro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  <strong className="text-white">10€</strong> de frais dans un rayon de{" "}
                  <strong className="text-white">10 km</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <BadgeEuro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  <strong className="text-white">20€</strong> de frais au-delà de <strong className="text-white">10 km</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-2">
                  <span>Créneaux disponibles :</span>
                  {DELIVERY_SLOTS.map((slot) => (
                    <span
                      key={slot}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white"
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>Livraison jusqu&apos;à J+3 maximum, selon la date choisie au moment de la commande.</span>
              </li>
            </ul>
          </div>

          {/* Meet-up */}
          <div className="rounded-2xl border border-white/10 bg-[#050505]/60 p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3e6757]/20 text-[#3e6757]">
                <Store className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-xl font-semibold text-white">Retrait sur place (Meet-up)</h3>
            </div>

            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <BadgeEuro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  <strong className="text-white">Aucun frais</strong> de livraison pour un retrait en main propre.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  Disponible de <strong className="text-white">14H à 00H</strong>.
                </span>
              </li>
              <li className="flex flex-col gap-2">
                <span className="text-zinc-400">Heures de retrait au choix :</span>
                <div className="flex flex-wrap gap-2">
                  {MEETUP_HOURS.map((h) => (
                    <span
                      key={h}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
