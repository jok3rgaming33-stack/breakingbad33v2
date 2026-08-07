"use client"

import { getTimelineState } from "@/lib/order-timeline"
import { Check, X } from "lucide-react"

type Props = {
  status: string
  fulfillment?: string | null
  compact?: boolean
  className?: string
}

/**
 * Timeline visuelle du statut de commande (client + admin).
 */
export function OrderStatusTimeline({ status, fulfillment, compact = false, className = "" }: Props) {
  const state = getTimelineState(status, fulfillment)
  const { steps, currentIndex, cancelled, currentLabel } = state

  if (cancelled) {
    return (
      <div className={`rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
          <X className="h-4 w-4" aria-hidden="true" />
          Commande annulée
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Statut : {currentLabel}</p>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border border-border bg-background/50 px-3 py-3 ${className}`}>
      <p className={`mb-3 font-semibold text-accent ${compact ? "text-xs" : "text-sm"}`}>
        Suivi · {currentLabel}
      </p>
      <ol className="flex items-start justify-between gap-1">
        {steps.map((step, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          return (
            <li key={step.key} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <div className="relative mb-1.5 flex w-full items-center justify-center">
                {i > 0 && (
                  <span
                    className={`absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${
                      i <= currentIndex ? "bg-accent" : "bg-border"
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                    done
                      ? "border-accent bg-accent text-accent-foreground"
                      : current
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                </span>
              </div>
              <span
                className={`w-full truncate px-0.5 leading-tight ${
                  compact ? "text-[9px]" : "text-[10px]"
                } ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                title={step.label}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
