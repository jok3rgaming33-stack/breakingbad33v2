import { normalizeStatus, statusMeta, type OrderStatusKey } from "@/lib/order-status"

/** Étapes affichées dans la timeline client (hors discussions). */
export type TimelineStep = {
  key: OrderStatusKey
  label: string
}

export type VisualStepIcon = "prep" | "ready" | "transit" | "arrived" | "delivered" | "meetup" | "locker" | "pay"

export type VisualStep = {
  /** Clé de statut « représentative » (pour dater l'étape). */
  key: OrderStatusKey
  /** Statuts qui activent cette étape (le dernier atteint gagne). */
  match: OrderStatusKey[]
  label: string
  shortLabel: string
  icon: VisualStepIcon
}

const PIPELINE_DELIVERY: TimelineStep[] = [
  { key: "en_attente", label: "Reçue" },
  { key: "validee", label: "Validée" },
  { key: "preparation", label: "Préparation" },
  { key: "bientot_livraison", label: "Bientôt livrée" },
  { key: "livraison", label: "En route" },
  { key: "arrivee", label: "Sur place" },
  { key: "livree", label: "Livrée" },
]

const PIPELINE_MEETUP: TimelineStep[] = [
  { key: "en_attente", label: "Reçue" },
  { key: "validee", label: "Validée" },
  { key: "preparation", label: "Préparation" },
  { key: "pret_meetup", label: "Prêt à récupérer" },
  { key: "livree", label: "Remise" },
]

const PIPELINE_LOCKER: TimelineStep[] = [
  { key: "en_attente", label: "Reçue" },
  { key: "validee", label: "Paiement" },
  { key: "preparation", label: "Préparation" },
  { key: "livraison", label: "En locker" },
  { key: "livree", label: "Récupérée" },
]

/** Pipeline visuel compact (type tracking.png) — 4/5 pastilles max. */
const VISUAL_DELIVERY: VisualStep[] = [
  {
    key: "preparation",
    match: ["en_attente", "validee", "preparation"],
    label: "En préparation",
    shortLabel: "Prépa",
    icon: "prep",
  },
  {
    key: "bientot_livraison",
    match: ["bientot_livraison"],
    label: "Prêt pour la livraison",
    shortLabel: "Prêt",
    icon: "ready",
  },
  {
    key: "livraison",
    match: ["livraison"],
    label: "Livraison en cours",
    shortLabel: "En route",
    icon: "transit",
  },
  {
    key: "arrivee",
    match: ["arrivee"],
    label: "Arrivé à destination",
    shortLabel: "Sur place",
    icon: "arrived",
  },
  {
    key: "livree",
    match: ["livree"],
    label: "Livré",
    shortLabel: "Livré",
    icon: "delivered",
  },
]

const VISUAL_MEETUP: VisualStep[] = [
  {
    key: "preparation",
    match: ["en_attente", "validee", "preparation"],
    label: "En préparation",
    shortLabel: "Prépa",
    icon: "prep",
  },
  {
    key: "pret_meetup",
    match: ["pret_meetup", "bientot_livraison"],
    label: "Prêt à récupérer",
    shortLabel: "Prêt",
    icon: "meetup",
  },
  {
    key: "livree",
    match: ["livree"],
    label: "Remise",
    shortLabel: "Remise",
    icon: "delivered",
  },
]

const VISUAL_LOCKER: VisualStep[] = [
  {
    key: "validee",
    match: ["en_attente", "validee"],
    label: "Paiement",
    shortLabel: "Paiement",
    icon: "pay",
  },
  {
    key: "preparation",
    match: ["preparation"],
    label: "Préparation",
    shortLabel: "Prépa",
    icon: "prep",
  },
  {
    key: "livraison",
    match: ["bientot_livraison", "livraison", "arrivee"],
    label: "En locker",
    shortLabel: "Locker",
    icon: "locker",
  },
  {
    key: "livree",
    match: ["livree"],
    label: "Récupérée",
    shortLabel: "Récup.",
    icon: "delivered",
  },
]

export function getOrderPipeline(fulfillment?: string | null): TimelineStep[] {
  const f = (fulfillment || "livraison").toLowerCase()
  if (f === "meetup") return PIPELINE_MEETUP
  if (f === "locker") return PIPELINE_LOCKER
  return PIPELINE_DELIVERY
}

export function getVisualPipeline(fulfillment?: string | null): VisualStep[] {
  const f = (fulfillment || "livraison").toLowerCase()
  if (f === "meetup") return VISUAL_MEETUP
  if (f === "locker") return VISUAL_LOCKER
  return VISUAL_DELIVERY
}

export type TimelineState = {
  steps: TimelineStep[]
  /** Index de l'étape courante dans steps (-1 si hors pipeline / annulée) */
  currentIndex: number
  cancelled: boolean
  currentLabel: string
}

export type OrderTrackingState = {
  history?: Partial<Record<string, string>>
  etaMin?: number | null
  etaAt?: string | null
  etaArriveBy?: string | null
  cancelReason?: string | null
}

export type VisualTimelineState = {
  steps: VisualStep[]
  currentIndex: number
  cancelled: boolean
  currentLabel: string
  caption: string
  detail: string | null
}

/**
 * Calcule l'état de la timeline pour un statut + mode de livraison.
 * Les statuts "sautés" (ex. passe de validee à livraison) marquent les étapes précédentes comme faites.
 */
export function getTimelineState(
  status: string | null | undefined,
  fulfillment?: string | null,
): TimelineState {
  const key = normalizeStatus(status)
  const cancelled = key === "annulee"
  const steps = getOrderPipeline(fulfillment)

  if (cancelled) {
    return {
      steps,
      currentIndex: -1,
      cancelled: true,
      currentLabel: statusMeta(key).label,
    }
  }

  const effective = effectivePipelineKey(key, fulfillment)
  let currentIndex = steps.findIndex((s) => s.key === effective)
  if (currentIndex < 0) currentIndex = 0

  return {
    steps,
    currentIndex,
    cancelled: false,
    currentLabel: statusMeta(key).label,
  }
}

function effectivePipelineKey(key: OrderStatusKey, fulfillment?: string | null): OrderStatusKey {
  if (key === "pret_meetup" && fulfillment !== "meetup") {
    return fulfillment === "locker" ? "livraison" : "bientot_livraison"
  }
  if (key === "bientot_livraison" && fulfillment === "meetup") {
    return "pret_meetup"
  }
  if (key === "arrivee" && fulfillment !== "livraison") {
    return fulfillment === "locker" ? "livraison" : "pret_meetup"
  }
  return key
}

/** Index visuel : dernière étape dont un statut matché a été atteint. */
export function getVisualTimelineState(
  status: string | null | undefined,
  fulfillment?: string | null,
  tracking?: OrderTrackingState | null,
): VisualTimelineState {
  const key = normalizeStatus(status)
  const steps = getVisualPipeline(fulfillment)
  const cancelled = key === "annulee"
  const captionPack = getTrackingCaption(key, fulfillment, tracking)

  if (cancelled) {
    return {
      steps,
      currentIndex: -1,
      cancelled: true,
      currentLabel: statusMeta(key).label,
      caption: captionPack.title,
      detail: captionPack.detail,
    }
  }

  const effective = effectivePipelineKey(key, fulfillment)
  let currentIndex = steps.findIndex((s) => s.match.includes(effective) || s.key === effective)
  if (currentIndex < 0) currentIndex = 0

  return {
    steps,
    currentIndex,
    cancelled: false,
    currentLabel: statusMeta(key).label,
    caption: captionPack.title,
    detail: captionPack.detail,
  }
}

export function getTrackingCaption(
  status: string | null | undefined,
  fulfillment?: string | null,
  tracking?: OrderTrackingState | null,
): { title: string; detail: string | null } {
  const key = normalizeStatus(status)
  const f = (fulfillment || "livraison").toLowerCase()
  const eta = formatEtaHuman(tracking)

  switch (key) {
    case "en_attente":
      return { title: "Commande reçue.", detail: "En attente de validation." }
    case "validee":
      return {
        title: "Commande validée.",
        detail: f === "locker" ? "En attente du paiement." : "Préparation en cours.",
      }
    case "preparation":
      return { title: "Tes articles sont en préparation.", detail: null }
    case "pret_meetup":
      return { title: "Colis prêt à récupérer.", detail: "Rendez-vous au point meet-up convenu." }
    case "bientot_livraison":
      return {
        title: "Bientôt en livraison.",
        detail: "Le livreur va bientôt prendre en charge ton colis.",
      }
    case "livraison":
      if (f === "locker") {
        return { title: "Colis déposé en locker.", detail: "Pense à le récupérer avec ton token." }
      }
      return {
        title: "Ton colis est en route.",
        detail: eta ?? "Reste joignable, le livreur arrive.",
      }
    case "arrivee":
      return { title: "Le livreur est arrivé à destination.", detail: "Sors ou reste joignable." }
    case "livree":
      return {
        title: f === "meetup" ? "Commande remise." : f === "locker" ? "Commande récupérée." : "Commande livrée.",
        detail: "Merci pour ta confiance.",
      }
    case "annulee":
      return {
        title: "Commande annulée.",
        detail: tracking?.cancelReason?.trim() || null,
      }
    default:
      return { title: statusMeta(key).label, detail: null }
  }
}

export function formatEtaHuman(tracking?: OrderTrackingState | null): string | null {
  if (!tracking) return null
  const parts: string[] = []
  if (typeof tracking.etaMin === "number" && tracking.etaMin > 0) {
    if (tracking.etaMin < 60) {
      parts.push(`Arrivée estimée dans ~${tracking.etaMin} min`)
    } else {
      const h = Math.floor(tracking.etaMin / 60)
      const m = tracking.etaMin % 60
      parts.push(`Arrivée estimée dans ~${m ? `${h} h ${m} min` : `${h} h`}`)
    }
  }
  if (tracking.etaArriveBy) {
    const d = new Date(tracking.etaArriveBy)
    if (!Number.isNaN(d.getTime())) {
      const hh = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      parts.push(`avant ${hh}`)
    }
  }
  if (parts.length === 0) return null
  if (parts.length === 1) return `${parts[0]}.`
  return `${parts[0]} (${parts[1]}).`
}

export function formatStepDate(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
}

/** Date affichée sous une pastille : historique de l'étape, sinon rien. */
export function dateForVisualStep(
  step: VisualStep,
  tracking?: OrderTrackingState | null,
  createdAt?: Date | string | null,
): string | null {
  const history = tracking?.history ?? {}
  for (const k of [...step.match].reverse()) {
    if (history[k]) return formatStepDate(history[k])
  }
  if (step.match.includes("en_attente") && createdAt) {
    return formatStepDate(typeof createdAt === "string" ? createdAt : createdAt.toISOString())
  }
  return null
}

/** Anciens messages auto de statut — on les masque pour épurer le fil. */
const AUTO_STATUS_RE = [
  /ta demande a bien été reçue et est en cours de traitement/i,
  /ta discussion est ouverte/i,
  /cette discussion a été clôturée/i,
  /ta commande a été validée et prise en charge/i,
  /nous sommes en train de préparer tes articles/i,
  /ton colis est prêt\.?\s*tu peux venir le récupérer/i,
  /ton colis sera bientôt pris en charge par le livreur/i,
  /c'est parti ! le livreur est en route/i,
  /le livreur est en route/i,
  /temps de trajet estimé/i,
  /ta commande t'a bien été livrée/i,
  /ta commande a été annulée/i,
  /point(?:s)? de fidélité viennent d'être crédités/i,
]

export function isAutoStatusMessage(body: string | null | undefined): boolean {
  if (!body) return false
  if (body.includes("[NOTER_PRODUITS]")) return false
  const text = body.replace(/\s+/g, " ").trim()
  return AUTO_STATUS_RE.some((re) => re.test(text))
}

export function splitThreadForTracking<T extends { sender: string; body: string }>(
  messages: T[],
): { recap: T | null; rest: T[] } {
  const first = messages[0]
  const recap = first && first.sender === "client" ? first : null
  const rest = (recap ? messages.slice(1) : messages).filter((m) => !isAutoStatusMessage(m.body))
  return { recap, rest }
}
