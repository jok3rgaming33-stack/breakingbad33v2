"use client"

import {
  Package,
  PackageCheck,
  Truck,
  Home,
  Handshake,
  Wallet,
  Check,
  X,
  Clock,
} from "lucide-react"
import {
  dateForVisualStep,
  getVisualTimelineState,
  type OrderTrackingState,
  type VisualStepIcon,
} from "@/lib/order-timeline"

type Props = {
  orderId?: number | null
  status: string
  fulfillment?: string | null
  tracking?: OrderTrackingState | null
  createdAt?: Date | string | null
  scheduledSlot?: string | null
  colissimoNumber?: string | null
  compact?: boolean
  className?: string
}

const ICON: Record<VisualStepIcon, typeof Package> = {
  prep: Package,
  ready: PackageCheck,
  transit: Truck,
  arrived: Home,
  delivered: Handshake,
  meetup: Handshake,
  locker: PackageCheck,
  pay: Wallet,
}

function StepGlyph({
  icon,
  done,
  current,
  compact,
}: {
  icon: VisualStepIcon
  done: boolean
  current: boolean
  compact?: boolean
}) {
  const Icon = ICON[icon] ?? Package
  const size = compact ? "h-8 w-8" : "h-11 w-11 sm:h-12 sm:w-12"
  const iconSize = compact ? "h-3.5 w-3.5" : "h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]"

  return (
    <span
      className={`relative z-[1] flex ${size} items-center justify-center rounded-full border-2 transition-all duration-500 ${
        done
          ? "border-emerald-400 bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]"
          : current
            ? "order-track-current border-emerald-400 bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.45)]"
            : "border-zinc-600 bg-zinc-800/80 text-zinc-500"
      }`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {done && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#0a0a0a] bg-white text-emerald-600 sm:h-4 sm:w-4">
          <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

/**
 * Suivi graphique épinglé (miroir tracking.png) — dark, mobile + desktop.
 */
export function OrderTrackingCard({
  orderId,
  status,
  fulfillment,
  tracking,
  createdAt,
  scheduledSlot,
  colissimoNumber,
  compact = false,
  className = "",
}: Props) {
  const state = getVisualTimelineState(status, fulfillment, tracking)
  const { steps, currentIndex, cancelled, caption, detail } = state

  if (cancelled) {
    return (
      <div
        className={`rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 ${className}`}
        role="status"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
          <X className="h-4 w-4" aria-hidden="true" />
          Commande #{orderId ?? "—"} annulée
        </div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">Motif : {detail}</p>}
      </div>
    )
  }

  const slotHint =
    (normalizeIsTransit(status) || currentIndex >= steps.findIndex((s) => s.icon === "transit")) &&
    scheduledSlot
      ? `Créneau prévu : ${scheduledSlot}`
      : null

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-[#111] px-3 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.35)] sm:px-5 sm:py-5 ${className}`}
      aria-label={`Suivi de la commande${orderId ? ` n° ${orderId}` : ""}`}
    >
      <p
        className={`mb-4 text-center font-bold uppercase tracking-[0.14em] text-white ${
          compact ? "text-[10px]" : "text-[11px] sm:text-xs"
        }`}
      >
        Suivi de votre commande{orderId != null ? ` n° ${orderId}` : ""}
      </p>

      <ol className="flex items-start justify-between gap-0.5 sm:gap-1">
        {steps.map((step, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          const date = dateForVisualStep(step, tracking, createdAt)
          return (
            <li key={step.key} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <div className="relative mb-2 flex w-full items-center justify-center">
                {i > 0 && (
                  <span
                    className={`absolute right-1/2 top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full transition-colors duration-500 ${
                      i <= currentIndex ? "bg-emerald-400" : "bg-zinc-700"
                    }`}
                    aria-hidden="true"
                  />
                )}
                <StepGlyph icon={step.icon} done={done} current={current} compact={compact} />
              </div>
              <span
                className={`w-full px-0.5 font-semibold uppercase leading-tight ${
                  compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
                } ${current ? "text-emerald-400" : done ? "text-zinc-300" : "text-zinc-500"}`}
              >
                {i + 1}.{" "}
                {compact ? (
                  step.shortLabel
                ) : (
                  <>
                    <span className="sm:hidden">{step.shortLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </>
                )}
              </span>
              <span
                className={`mt-0.5 ${compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"} ${
                  current ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {date ?? (current ? "En cours" : "—")}
              </span>
            </li>
          )
        })}
      </ol>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes orderTrackPulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); }
              50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
            }
            .order-track-current { animation: orderTrackPulse 2s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .order-track-current { animation: none; }
            }
          `,
        }}
      />

      {!compact && (
        <div className="mt-4 space-y-1 text-center">
          <p className="text-sm font-medium text-zinc-200">{caption}</p>
          {detail && <p className="text-xs text-zinc-400">{detail}</p>}
          {slotHint && (
            <p className="flex items-center justify-center gap-1 text-[11px] text-zinc-500">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {slotHint}
            </p>
          )}
          {colissimoNumber && (
            <p className="text-[11px] text-zinc-500">
              Suivi transporteur :{" "}
              <span className="font-mono text-zinc-300">{colissimoNumber}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function normalizeIsTransit(status: string) {
  const s = status.trim().toLowerCase()
  return s === "livraison" || s === "arrivee"
}
