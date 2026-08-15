"use client"

import { OrderTrackingCard } from "@/components/order-tracking-card"
import type { OrderTrackingState } from "@/lib/order-timeline"

type Props = {
  status: string
  fulfillment?: string | null
  compact?: boolean
  className?: string
  orderId?: number | null
  tracking?: OrderTrackingState | null
  createdAt?: Date | string | null
  scheduledSlot?: string | null
  colissimoNumber?: string | null
}

/**
 * Timeline visuelle du statut de commande (client + admin).
 * Délègue à la carte graphique type tracking.png.
 */
export function OrderStatusTimeline(props: Props) {
  return <OrderTrackingCard {...props} />
}
