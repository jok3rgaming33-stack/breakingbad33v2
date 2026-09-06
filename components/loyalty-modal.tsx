"use client"

import { useEffect, useState } from "react"
import { X, Gift, Check, Copy, Loader2, Ticket, AlertCircle, Crown, Truck, Timer } from "lucide-react"
import { ensureReferralCode, getCustomerStats, type CustomerStats } from "@/app/actions/account"
import { generateLoyaltyCode, listLoyaltyCodes } from "@/app/actions/promo"
import type { LoyaltyCode } from "@/lib/db/schema"
import {
  LOYALTY_REWARDS,
  LOYALTY_TIERS,
  PLATINUM_FREE_DELIVERY_POINTS_COST,
  type LoyaltyReward,
} from "@/lib/loyalty"
import { backdropDismissProps } from "@/lib/backdrop-close"

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00j 00h 00m 00s"
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d)}j ${pad(h)}h ${pad(m)}m ${pad(s)}s`
}

type UserData = { pseudo?: string; token?: string } | null

type LoyaltyModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
}

export function LoyaltyModal({ isOpen, onClose, userData }: LoyaltyModalProps) {
  const token = userData?.token ?? ""
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [view, setView] = useState<"rewards" | "codes" | "parrainage" | "paliers">("rewards")
  const [myCodes, setMyCodes] = useState<LoyaltyCode[]>([])
  const [generating, setGenerating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [referralLoading, setReferralLoading] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const loadReferralCode = async () => {
    if (!token) return
    setReferralLoading(true)
    try {
      const res = await ensureReferralCode(token)
      if (res.ok && res.code) setReferralCode(res.code)
      else if (res.error) setError(res.error)
    } catch {
      setError("Impossible de charger le code parrain.")
    } finally {
      setReferralLoading(false)
    }
  }

  const refresh = () => {
    if (!token) return
    getCustomerStats(token)
      .then((s) => {
        setStats(s)
        if (s.referralCode) setReferralCode(s.referralCode)
      })
      .catch(() => setStats(null))
    listLoyaltyCodes(token)
      .then(setMyCodes)
      .catch(() => setMyCodes([]))
    void loadReferralCode()
  }

  useEffect(() => {
    if (!isOpen || !token) return
    setStats(null)
    setReferralCode(null)
    setView("rewards")
    setError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token])

  // Timer live (1s) tant que le mois offert Platine est actif
  useEffect(() => {
    if (!isOpen || !stats?.freeDeliveryActive || !stats.freeDeliveryUntil) return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isOpen, stats?.freeDeliveryActive, stats?.freeDeliveryUntil])

  // Recharge le code dès qu'on ouvre l'onglet Parrainage
  useEffect(() => {
    if (!isOpen || !token || view !== "parrainage") return
    if (!referralCode) void loadReferralCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isOpen, token])

  if (!isOpen) return null

  const name = userData?.pseudo ?? "Invité"
  const balance = stats?.points ?? 0
  const tierId = stats?.tierId ?? "bronze"
  const tierLabel = stats?.tierLabel ?? "Bronze"
  const tierEmoji = stats?.tierEmoji ?? ""
  const multi = stats?.pointsMultiplier ?? 1

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleGenerate = async (reward: LoyaltyReward) => {
    if (balance < reward.points || generating) return
    setGenerating(reward.points)
    setError(null)
    const res = await generateLoyaltyCode(token, reward.points)
    setGenerating(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    refresh()
    setView("codes")
  }

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
      {...backdropDismissProps(handleClose)}
      role="dialog"
      aria-modal="true"
      aria-label="Espace fidélité"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl border border-accent/40 bg-card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-balance sm:text-2xl">Espace fidélité</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Membre + solde + palier */}
        <div className="mb-3 rounded-2xl border border-border bg-background/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Membre</div>
              <div className="truncate font-mono text-lg font-bold">
                {tierEmoji ? `${tierEmoji} ` : ""}
                {name}
              </div>
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  LOYALTY_TIERS.find((t) => t.id === tierId)?.color ?? ""
                }`}
              >
                <Crown className="h-3 w-3" aria-hidden="true" />
                {tierLabel}
                {multi > 1 ? ` · ×${multi} pts` : ""}
              </span>
              {stats?.fromPeak && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Palier conservé (les bons ne te font pas redescendre)
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold text-accent">
                {stats === null ? <Loader2 className="ml-auto h-6 w-6 animate-spin" aria-hidden="true" /> : balance}
              </div>
              <div className="text-xs text-muted-foreground">
                points
                {multi > 1 ? ` (base ×${multi})` : " (1€ = 1 pt)"}
              </div>
            </div>
          </div>
          {stats?.nextTierLabel && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Progression vers {stats.nextTierLabel}</span>
                <span>{stats.spentToNext} pts restants</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.round((stats.progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Pts statut : {stats.qualifyingSpend} · solde points : {balance}
              </p>
            </div>
          )}
          {tierId === "platinum" && !stats?.nextTierLabel && (
            <p className="mt-2 text-[10px] font-semibold text-cyan-300">
              💎 Palier Platine atteint — pts statut : {stats?.qualifyingSpend ?? 0}
            </p>
          )}
          {stats?.tierId === "platinum" && stats.freeDeliveryActive && stats.freeDeliveryUntil && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2.5 text-cyan-200">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Fenêtre Platine — livraison offerte · commandes ≥ {stats.freeDeliveryMinOrder}€
              </div>
              <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-wide text-cyan-100">
                <Timer className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                {formatCountdown(new Date(stats.freeDeliveryUntil).getTime() - nowTick)}
              </div>
              <p className="text-[10px] text-cyan-300/80">
                Actif jusqu’au {new Date(stats.freeDeliveryUntil).toLocaleString("fr-FR")}. Hors fenêtre :
                livraison offerte possible contre{" "}
                {stats.freeDeliveryPointsCost ?? PLATINUM_FREE_DELIVERY_POINTS_COST} pts par commande.
              </p>
            </div>
          )}
          {stats?.tierId === "platinum" && stats.freeDeliveryExpired && (
            <div className="mt-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-[11px] text-cyan-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Avantage Platine — livraison
              </div>
              <p className="mt-1 text-cyan-100/90">
                Ta fenêtre de 30 jours est close. Tu peux toujours offrir la livraison sur une commande en
                dépensant{" "}
                <strong>{stats.freeDeliveryPointsCost ?? PLATINUM_FREE_DELIVERY_POINTS_COST} points</strong>{" "}
                (au panier), aussi souvent que ton solde le permet.
                {balance < (stats.freeDeliveryPointsCost ?? PLATINUM_FREE_DELIVERY_POINTS_COST)
                  ? ` Solde : ${balance} pts.`
                  : ` Solde : ${balance} pts.`}
              </p>
            </div>
          )}
        </div>

        {/* Onglets */}
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {(
            [
              ["rewards", "Récomp."],
              ["paliers", "Paliers"],
              ["codes", "Codes"],
              ["parrainage", "Parrain"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`rounded-xl py-2 text-[11px] font-medium transition-colors sm:text-xs ${
                view === id ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {label}
              {id === "codes" && myCodes.length > 0 ? ` (${myCodes.length})` : ""}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {view === "paliers" ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-muted-foreground">
                Les paliers se basent sur tes <strong className="text-foreground">points de statut</strong>{" "}
                (1€ hors remise fidélité = 1 pt statut). Utiliser un bon réduit le solde de points de la
                commande, jamais un palier déjà atteint.
              </p>
              {LOYALTY_TIERS.map((t) => {
                const active = t.id === tierId
                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl border p-3 ${
                      active ? "border-accent/50 bg-accent/10" : "border-border bg-background/40"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.color}`}>
                        {t.emoji ? `${t.emoji} ` : ""}
                        {t.label}
                        {active ? " · toi" : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        dès {t.minSpent} pts · ×{t.pointsMultiplier}
                      </span>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {t.perks.map((p) => (
                        <li key={p} className="flex gap-1.5">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                          <span className="text-foreground/90">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : view === "rewards" ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Avantages de ton palier</p>
                <ul className="space-y-1 text-xs text-foreground">
                  {(LOYALTY_TIERS.find((t) => t.id === tierId)?.perks ?? []).map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-muted-foreground">
                💡 {stats?.voucherPolicyHint ??
                  "Les bons baissent les points de la commande, pas ton palier déjà gagné."}
              </p>
              {LOYALTY_REWARDS.map((reward) => {
                const affordable = balance >= reward.points
                const busy = generating === reward.points
                return (
                  <button
                    key={reward.points}
                    type="button"
                    onClick={() => handleGenerate(reward)}
                    disabled={!affordable || busy}
                    className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        {view === "rewards" ? <Gift className="h-5 w-5" aria-hidden="true" /> : <Ticket className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-semibold">{reward.label} de réduction</div>
                        <div className="text-xs text-muted-foreground">
                          {reward.points} points · dès {reward.minAmount}€ d&apos;achat
                        </div>
                      </div>
                    </div>
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
                    ) : affordable ? (
                      <span className="text-xs font-semibold text-accent">Générer</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{reward.points - balance} pts manquants</span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : view === "codes" ? (
            <div className="flex flex-col gap-3">
              {myCodes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucun code généré. Échange tes points dans l&apos;onglet Récompenses.
                </p>
              ) : (
                myCodes.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${
                      c.used ? "border-border bg-background/40 opacity-60" : "border-accent/40 bg-accent/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-base font-bold tracking-wider">{c.code}</div>
                      <div className="text-xs text-muted-foreground">
                        -{c.discount}€ · dès {c.minAmount}€ {c.used ? "· utilisé" : ""}
                      </div>
                    </div>
                    {!c.used && (
                      <button
                        type="button"
                        onClick={() => handleCopy(c.code)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                        aria-label="Copier le code"
                      >
                        {copied === c.code ? (
                          <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Partage ton code : à la <strong className="text-foreground">1ʳᵉ livraison</strong> de ton
                filleul, il gagne <strong className="text-foreground">30 pts</strong> et tu gagnes{" "}
                <strong className="text-foreground">50 pts</strong> (+25 si Platine). Aucun bonus à
                l&apos;inscription seule.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Ton code parrain</p>
                  {referralLoading && !referralCode ? (
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Génération…
                    </div>
                  ) : (
                    <p className="font-mono text-xl font-bold tracking-wider break-all">
                      {referralCode || stats?.referralCode || "—"}
                    </p>
                  )}
                </div>
                {(referralCode || stats?.referralCode) && (
                  <button
                    type="button"
                    onClick={() => handleCopy((referralCode || stats?.referralCode)!)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary hover:bg-muted"
                    aria-label="Copier le code parrain"
                  >
                    {copied === (referralCode || stats?.referralCode) ? (
                      <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
              {!referralCode && !referralLoading && (
                <button
                  type="button"
                  onClick={() => void loadReferralCode()}
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  Afficher / générer mon code
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Un nouveau membre peut saisir ce code à la création de son compte (optionnel). Le bonus
                est versé à sa 1ʳᵉ commande livrée.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
