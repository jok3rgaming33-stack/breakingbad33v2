import { normalizeStatus, statusMeta, type OrderStatusKey } from "@/lib/order-status"

/** Étapes affichées dans la timeline client (hors discussions). */
export type TimelineStep = {
  key: OrderStatusKey
  label: string
}

const PIPELINE_DELIVERY: TimelineStep[] = [
  { key: "en_attente", label: "Reçue" },
  { key: "validee", label: "Validée" },
  { key: "preparation", label: "Préparation" },
  { key: "bientot_livraison", label: "Bientôt livrée" },
  { key: "livraison", label: "En route" },
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

export function getOrderPipeline(fulfillment?: string | null): TimelineStep[] {
  const f = (fulfillment || "livraison").toLowerCase()
  if (f === "meetup") return PIPELINE_MEETUP
  if (f === "locker") return PIPELINE_LOCKER
  return PIPELINE_DELIVERY
}

export type TimelineState = {
  steps: TimelineStep[]
  /** Index de l'étape courante dans steps (-1 si hors pipeline / annulée) */
  currentIndex: number
  cancelled: boolean
  currentLabel: string
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

  // Mappe certains statuts hors pipeline vers une étape proche
  let effective: OrderStatusKey = key
  if (key === "pret_meetup" && fulfillment !== "meetup") {
    effective = fulfillment === "locker" ? "livraison" : "bientot_livraison"
  }
  if (key === "bientot_livraison" && fulfillment === "meetup") {
    effective = "pret_meetup"
  }

  let currentIndex = steps.findIndex((s) => s.key === effective)
  if (currentIndex < 0) {
    // Statut inconnu / discussion : première étape
    currentIndex = 0
  }

  return {
    steps,
    currentIndex,
    cancelled: false,
    currentLabel: statusMeta(key).label,
  }
}
