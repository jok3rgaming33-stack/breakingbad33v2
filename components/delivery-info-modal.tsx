"use client"

import { useEffect, useState } from "react"
import { X as CloseIcon, Truck, Store, MapPin, Clock, BadgeEuro, Info, Users } from "lucide-react"

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
          <h2 className="mb-6 mt-2 text-balance text-4xl font-bold text-white">Livraison & Meet-up</h2>

          {/* Recommandations */}
          <div className="mb-6 rounded-2xl border border-[#3e6757]/30 bg-[#3e6757]/10 p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3e6757]/20 text-[#3e6757]">
                <Info className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold text-white">Recommandations</h3>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-zinc-300">
              Afin de garantir un service de qualité et d&apos;assurer le bon déroulement de ta commande, merci de
              prendre en compte ces recommandations pour tes achats.
            </p>
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  Une résa passée <strong className="text-white">24h à l&apos;avance</strong>, c&apos;est la garantie de
                  palier à tous les aléas possibles.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  Une résa passée <strong className="text-white">après 22h</strong> : livraison à{" "}
                  <strong className="text-white">J+1 à partir de 14H</strong>.
                </span>
              </li>
            </ul>
          </div>

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
                  Possible <strong className="text-white">uniquement à partir de 50€</strong> d&apos;achat.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <BadgeEuro className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  <strong className="text-white">10€</strong> de frais de livraison, avec{" "}
                  <strong className="text-white">revalorisation au-delà de 10 km</strong> de nos locaux.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  De <strong className="text-white">14H à 02H</strong> (selon disponibilités).
                </span>
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
                  De <strong className="text-white">10€ à 40€</strong> d&apos;achat :{" "}
                  <strong className="text-white">retrait en meet-up uniquement</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  <strong className="text-white">Adresse unique</strong> et sécurisée.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
                <span>
                  De <strong className="text-white">14H à 00H</strong> (selon disponibilités).
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

          {/* Note finale */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#050505]/60 p-5 text-sm text-zinc-300">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#3e6757]" aria-hidden="true" />
            <span>
              Il est possible que lors du choix de votre jour et créneau horaire vous ne soyez pas seul(e). Nous vous
              garantissons une livraison optimale en prenant en compte les attentes de chacun(e).
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
