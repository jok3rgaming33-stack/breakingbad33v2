"use client"

import { useEffect, useState } from "react"
import { X as CloseIcon, Truck, Store, MapPin, Clock, Euro } from "lucide-react"

type DeliveryModalProps = {
  isOpen: boolean
  onClose: () => void
}

const DELIVERY_SLOTS = ["14H - 17H", "18H - 20H", "21H - 02H"]
const MEETUP_HOURS = ["14H", "15H", "16H", "17H", "18H", "19H", "20H", "21H", "22H", "23H", "00H"]

export function DeliveryModal({ isOpen, onClose }: DeliveryModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 4000)
    return () => clearTimeout(timer)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Livraison et Meet-up"
    >
      <div
        className="relative max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Effet fumée */}
        <div
          className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-1000 ${
            isAnimating ? "opacity-100" : "opacity-[0.07]"
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

        <div className="relative z-20 max-h-[88vh] overflow-y-auto p-8 md:p-12">
          {/* En-tête */}
          <div className="mb-10 flex items-center gap-4">
            <Truck className="h-8 w-8 text-[#3e6757]" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#3e6757]">Logistique</p>
              <h2 className="text-3xl font-light tracking-tight text-white">Livraison &amp; Meet-up</h2>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Livraison */}
            <div className="rounded-2xl border border-white/10 bg-[#050505]/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#3e6757]" />
                <h3 className="text-lg font-semibold text-white">Livraison à domicile</h3>
              </div>

              <div className="mb-5 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Euro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" />
                  <p>
                    <span className="font-medium text-white">10&euro;</span> de frais dans un rayon de 10&nbsp;km,{" "}
                    <span className="font-medium text-white">20&euro;</span> au-del&agrave;.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" />
                  <p>Distance calcul&eacute;e automatiquement depuis votre adresse au moment de la commande.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                <Clock className="h-4 w-4 text-[#3e6757]" />
                <span className="text-xs uppercase tracking-wider text-zinc-500">Cr&eacute;neaux</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {DELIVERY_SLOTS.map((slot) => (
                  <span
                    key={slot}
                    className="rounded-full border border-[#3e6757]/40 bg-[#3e6757]/10 px-3 py-1 text-xs font-medium text-[#5a9580]"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>

            {/* Meet-up */}
            <div className="rounded-2xl border border-white/10 bg-[#050505]/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Store className="h-5 w-5 text-[#3e6757]" />
                <h3 className="text-lg font-semibold text-white">Retrait sur place (Meet-up)</h3>
              </div>

              <div className="mb-5 space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-3">
                  <Euro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" />
                  <p>
                    <span className="font-medium text-white">Gratuit</span> &mdash; aucun frais de d&eacute;placement.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" />
                  <p>Disponible en continu de 14H &agrave; 00H, &agrave; l&apos;heure de votre choix.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                <Clock className="h-4 w-4 text-[#3e6757]" />
                <span className="text-xs uppercase tracking-wider text-zinc-500">Horaires</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {MEETUP_HOURS.map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-zinc-600">
            Le choix entre livraison et meet-up se fait directement dans votre panier au moment de la commande.
          </p>
        </div>
      </div>
    </div>
  )
}
