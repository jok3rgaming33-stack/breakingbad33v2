"use client"

import { useState } from "react"
import {
  X,
  UserCircle2,
  ShoppingCart,
  Bell,
  MessageSquare,
  Truck,
  Store,
  Gift,
  Smartphone,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

type Section = {
  icon: React.ReactNode
  title: string
  color: string
  steps: { label: string; desc: string }[]
}

const SECTIONS: Section[] = [
  {
    icon: <UserCircle2 className="h-5 w-5" />,
    title: "1. Créer ton compte",
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    steps: [
      {
        label: "Choisis un pseudo anonyme",
        desc: "Aucun email ni numéro de téléphone requis. Ton pseudo est ton seul identifiant visible.",
      },
      {
        label: "Note ton token secret",
        desc: "À la création, un token unique t'est attribué. C'est la clé de ta session — garde-le précieusement pour te reconnecter sur n'importe quel appareil.",
      },
    ],
  },
  {
    icon: <ShoppingCart className="h-5 w-5" />,
    title: "2. Commander",
    color: "text-accent bg-accent/10 border-accent/20",
    steps: [
      {
        label: "Ajoute des produits au panier",
        desc: "Browse les produits disponibles et ajoute ceux que tu veux. Le stock est en temps réel.",
      },
      {
        label: "Choisis ton mode de récupération",
        desc: "Livraison à domicile (dès 50€) ou Meet-up à un point convenu — tu sélectionnes la date et le créneau horaire.",
      },
      {
        label: "Valide ta commande",
        desc: "Un récapitulatif complet s'affiche avant confirmation. Aucun paiement en ligne : le règlement se fait lors de la réception.",
      },
    ],
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: "3. Notifications push",
    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    steps: [
      {
        label: "Active les notifications depuis la cloche",
        desc: "Clique sur la cloche en haut à droite, puis sur « Activer les notifications ». Tu recevras des alertes même quand le site est fermé.",
      },
      {
        label: "Autorise dans ton navigateur",
        desc: "Un pop-up de ton navigateur te demande l'autorisation — accepte-le. Sur iPhone, il faut ajouter le site à l'écran d'accueil (Safari → Partager → Sur l'écran d'accueil) pour activer les push.",
      },
      {
        label: "Ce que tu recevras",
        desc: "Suivi de commande en temps réel (validée, en préparation, en route, livrée), nouveaux messages du vendeur, et annonces importantes.",
      },
    ],
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    title: "4. Messagerie",
    color: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    steps: [
      {
        label: "Un fil par commande",
        desc: "Chaque commande ouvre automatiquement un fil de discussion privé avec le vendeur. Retrouve-le dans « Messagerie » dans le menu.",
      },
      {
        label: "Contact direct",
        desc: "Tu peux aussi envoyer un message sans commande en cours — idéal pour une question, un devis ou un renseignement.",
      },
    ],
  },
  {
    icon: <Truck className="h-5 w-5" />,
    title: "5. Livraison & Meet-up",
    color: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    steps: [
      {
        label: "Livraison (dès 50€)",
        desc: "La livraison est disponible à partir de 50€ d'achat. Les frais varient selon la distance (10€ ≤ 10 km, 20€ au-delà). Tu choisis un créneau horaire parmi ceux disponibles.",
      },
      {
        label: "Meet-up",
        desc: "Retrait à un point convenu entre toi et le vendeur. Disponible dès 1€. Les créneaux déjà passés n'apparaissent plus automatiquement.",
      },
    ],
  },
  {
    icon: <Gift className="h-5 w-5" />,
    title: "6. Programme fidélité",
    color: "text-pink-400 bg-pink-400/10 border-pink-400/20",
    steps: [
      {
        label: "Points automatiques",
        desc: "Tu gagnes des points à chaque commande livrée (1 point par euro dépensé). Consulte ton solde dans « Espace fidélité ».",
      },
      {
        label: "Codes promo",
        desc: "Des codes exclusifs sont distribués via les annonces (popup) ou directement en messagerie. Saisis-les dans le panier au moment de la commande.",
      },
    ],
  },
  {
    icon: <Smartphone className="h-5 w-5" />,
    title: "7. Version mobile",
    color: "text-teal-400 bg-teal-400/10 border-teal-400/20",
    steps: [
      {
        label: "Ajoute le site à ton écran d'accueil",
        desc: "Sur iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil ». Sur Android (Chrome) : menu ⋮ → « Ajouter à l'écran d'accueil ». Le site s'ouvre alors comme une vraie app, sans barre de navigation.",
      },
      {
        label: "Notifications iOS",
        desc: "Les notifications push sur iPhone nécessitent obligatoirement l'ajout à l'écran d'accueil — c'est une limitation d'Apple, pas du site.",
      },
    ],
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "8. Sécurité & confidentialité",
    color: "text-red-400 bg-red-400/10 border-red-400/20",
    steps: [
      {
        label: "Aucune donnée personnelle",
        desc: "Pas d'email, pas de téléphone, pas de nom réel. Ton pseudo et ton token sont les seuls identifiants — tu es maître de ta confidentialité.",
      },
      {
        label: "Reconnexion multi-appareils",
        desc: "Ton token te permet de récupérer ton compte sur n'importe quel appareil. Si tu le perds, tu ne pourras plus accéder à ton historique de commandes.",
      },
    ],
  },
]

type Props = {
  isOpen: boolean
  onClose: () => void
}

export function HowItWorksModal({ isOpen, onClose }: Props) {
  const [expanded, setExpanded] = useState<number | null>(0)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Comment ça marche"
    >
      <div className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Comment ça marche ?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tout ce qu&apos;il faut savoir pour commander en toute confiance.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-2">
            {SECTIONS.map((section, i) => {
              const isOpen = expanded === i
              return (
                <div
                  key={i}
                  className={`overflow-hidden rounded-2xl border transition-colors ${isOpen ? "border-border bg-secondary/40" : "border-border/50 bg-background/40"}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${section.color}`}>
                        {section.icon}
                      </span>
                      <span className="font-semibold">{section.title}</span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/50 px-4 pb-4 pt-3">
                      <ol className="flex flex-col gap-3">
                        {section.steps.map((step, j) => (
                          <li key={j} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[10px] font-bold text-muted-foreground">
                              {j + 1}
                            </span>
                            <div>
                              <p className="text-sm font-semibold leading-snug">{step.label}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Une question ? Utilise la{" "}
            <span className="font-semibold text-foreground">Messagerie</span> pour contacter directement l&apos;équipe.
          </p>
        </div>
      </div>
    </div>
  )
}
