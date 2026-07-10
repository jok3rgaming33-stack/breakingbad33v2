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
  Package,
  Coins,
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
    icon: <Package className="h-5 w-5" />,
    title: "3. Locker Mondial Relay",
    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    steps: [
      {
        label: "C'est quoi le locker ?",
        desc: "Le Locker Mondial Relay est un mode de livraison discret : ton colis est déposé dans un point relais de ton choix. Tu le récupères quand tu veux, sans contact direct avec le vendeur.",
      },
      {
        label: "Comment ça marche ?",
        desc: "Au moment de la commande, sélectionne \"Locker Mondial Relay\". Tu recevras un token TRK_ dans tes commandes — sauvegarde-le, il est indispensable pour suivre ton colis. Ce token te sera demandé à chaque ouverture du suivi.",
      },
      {
        label: "Paiement en Monero (XMR)",
        desc: "Les commandes locker se règlent exclusivement en Monero (XMR) pour ta confidentialité. Une fois ta commande validée, l'adresse de dépôt t'est communiquée dans ton suivi locker. Consulte la section \"Paiement XMR\" ci-dessous pour savoir comment procéder.",
      },
      {
        label: "Livraison & récupération",
        desc: "Une fois ton dépôt XMR confirmé, la préparation démarre. Tu reçois les informations de suivi Mondial Relay dans ton fil locker. Va chercher ton colis au point relais avec le code de retrait fourni.",
      },
    ],
  },
  {
    icon: <Coins className="h-5 w-5" />,
    title: "4. Paiement XMR — comment faire",
    color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    steps: [
      {
        label: "Ce dont tu as besoin",
        desc: "Installe Cake Wallet (cakewallet.com — dispo iOS & Android, open-source et gratuit). C'est le seul outil dont tu as besoin : il gère l'achat, l'échange et l'envoi en une seule app.",
      },
      {
        label: "Etape 1 — Achète du Litecoin (LTC) sur Coinbase",
        desc: "Ouvre Coinbase → Acheter → cherche Litecoin (LTC) → saisis ton montant en euros → confirme. Le LTC est simple à acheter partout et sert de passerelle vers le XMR. Préfère le virement SEPA (moins de frais) si tu n'es pas pressé. Compte 2-6% de frais au total sur l'opération.",
      },
      {
        label: "Etape 2 — Transfère les LTC vers Cake Wallet",
        desc: "Dans Cake Wallet, crée un wallet Litecoin → appuie sur Recevoir → copie ton adresse LTC. Dans Coinbase : Envoyer → colle l'adresse LTC de Cake. Attends 15-30 min que les fonds arrivent. Pour tes premiers essais, commence par un petit montant test.",
      },
      {
        label: "Etape 3 — Envoie directement en XMR au vendeur (Pay Anything)",
        desc: "Dans Cake Wallet → Envoyer → colle l'adresse XMR fournie par le vendeur dans ton suivi locker. Cake détecte que c'est une adresse XMR et propose automatiquement le swap LTC→XMR. Vérifie le montant final XMR affiché, choisis \"Taux fixe\" si disponible, puis confirme. Les XMR arrivent directement chez le vendeur sans étape supplémentaire.",
      },
      {
        label: "Etape 4 — Confirme ton dépôt",
        desc: "Une fois l'opération terminée (10-45 min en général), retourne dans ton suivi locker et clique sur \"J'ai effectué mon dépôt\". Le vendeur vérifie la réception et lance la préparation de ta commande.",
      },
      {
        label: "Conseils essentiels",
        desc: "Vérifie toujours l'adresse XMR caractère par caractère — une erreur = fonds perdus définitivement. Note ta seed phrase Cake Wallet sur papier, jamais en photo. Commence par de petits montants pour t'habituer. En cas de souci, garde le TX ID LTC pour le support Cake Wallet.",
      },
    ],
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: "5. Notifications push",
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
    title: "6. Messagerie",
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
    title: "7. Livraison & Meet-up",
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
    title: "8. Programme fidélité",
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
    title: "9. Version mobile",
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
    title: "10. Sécurité & confidentialité",
    color: "text-red-400 bg-red-400/10 border-red-400/20",
    steps: [
      {
        label: "Aucune donnée personnelle",
        desc: "Pas de vrai nom, pas de téléphone. Ton pseudo et ton token sont tes seuls identifiants — tu es maître de ta confidentialité dès la création du compte.",
      },
      {
        label: "Utilise une adresse email dédiée et anonyme",
        desc: "Si le site te demande un email (notifications, contact), crée une adresse exprès avec de fausses informations. On recommande ProtonMail (proton.me) : gratuit, chiffré, basé en Suisse, aucune vraie identité requise à la création. Sinon SimpleLogin ou Tutanota offrent le même niveau de confidentialité. Ne jamais utiliser ton email personnel.",
      },
      {
        label: "Récupérer ton compte sur un autre appareil",
        desc: "Ton token secret (affiché une seule fois à la création) est ta clé d'accès universelle. Depuis l'app : bouton \"J'ai déjà une clé\" → colle ton token → tu retrouves tout ton historique. Note-le sur papier, hors ligne — si tu le perds, l'accès est définitivement perdu.",
      },
      {
        label: "Reconnexion multi-appareils",
        desc: "Le même token fonctionne sur tous tes appareils simultanément : téléphone, tablette, PC. Tu peux l'utiliser depuis un navigateur en navigation privée pour ne laisser aucune trace.",
      },
    ],
  },
]

import { CheckCircle2 } from "lucide-react"

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Quand true : force l'ouverture de toutes les sections avant de pouvoir fermer */
  requireRead?: boolean
}

export function HowItWorksModal({ isOpen, onClose, requireRead = false }: Props) {
  const [expanded, setExpanded] = useState<number | null>(0)
  const [seen, setSeen] = useState<Set<number>>(new Set([0])) // section 0 ouverte par défaut

  const allSeen = seen.size >= SECTIONS.length
  const canClose = !requireRead || allSeen

  const toggle = (i: number) => {
    const opening = expanded !== i
    setExpanded(opening ? i : null)
    if (opening) setSeen((prev) => new Set(prev).add(i))
  }

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
              {requireRead
                ? "Déploie chaque section pour débloquer la création de ta clé d'accès."
                : "Tout ce qu'il faut savoir pour commander en toute confiance."}
            </p>
          </div>
          {/* X visible seulement si pas en mode requireRead, ou si tout est lu */}
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Barre de progression (requireRead uniquement) */}
        {requireRead && (
          <div className="shrink-0 border-b border-border px-6 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sections consultées</span>
              <span className="text-xs font-semibold text-foreground">{seen.size} / {SECTIONS.length}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${(seen.size / SECTIONS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-2">
            {SECTIONS.map((section, i) => {
              const isExpanded = expanded === i
              const hasBeenSeen = seen.has(i)
              return (
                <div
                  key={i}
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    isExpanded
                      ? "border-border bg-secondary/40"
                      : hasBeenSeen
                        ? "border-accent/30 bg-background/40"
                        : "border-border/50 bg-background/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${section.color}`}>
                        {section.icon}
                      </span>
                      <span className="font-semibold">{section.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {requireRead && hasBeenSeen && (
                        <CheckCircle2 className="h-4 w-4 text-accent" aria-label="Section consultée" aria-hidden="true" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
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

          {/* Bouton de validation — apparait quand tout est lu (requireRead uniquement) */}
          {requireRead && allSeen && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-accent/40 bg-accent/5">
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
                  <p className="font-semibold text-foreground">Tu as consulté toutes les sections</p>
                </div>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                  L&apos;équipe reste disponible à tout moment via la messagerie pour répondre à tes questions.
                  Tu peux maintenant créer ta clé d&apos;accès anonyme.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  J&apos;ai compris le fonctionnement — créer ma clé
                </button>
              </div>
            </div>
          )}

          {/* Message d'invitation quand il reste des sections (requireRead uniquement) */}
          {requireRead && !allSeen && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Encore{" "}
              <span className="font-semibold text-foreground">{SECTIONS.length - seen.size} section{SECTIONS.length - seen.size > 1 ? "s" : ""}</span>
              {" "}à consulter pour débloquer la création de ta clé.
            </p>
          )}
        </div>

        {/* Footer — uniquement si pas requireRead ou si tout est déjà lu */}
        {(!requireRead || allSeen) && (
          <div className="shrink-0 border-t border-border px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Une question ? Utilise la{" "}
              <span className="font-semibold text-foreground">Messagerie</span> pour contacter directement l&apos;équipe.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
