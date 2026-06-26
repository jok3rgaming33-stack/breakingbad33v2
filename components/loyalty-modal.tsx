"use client"

import { useEffect, useState } from "react"
import { X, Gift, Check, Copy, Loader2, Ticket, AlertCircle } from "lucide-react"
import { getCustomerStats } from "@/app/actions/account"
import { generateLoyaltyCode, listLoyaltyCodes, type LoyaltyCode } from "@/app/actions/promo"
import { LOYALTY_REWARDS, type LoyaltyReward } from "@/lib/loyalty"

type UserData = { pseudo?: string; token?: string } | null

type LoyaltyModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
}

export function LoyaltyModal({ isOpen, onClose, userData }: LoyaltyModalProps) {
  const token = userData?.token ?? ""
  const [points, setPoints] = useState<number | null>(null)
  const [view, setView] = useState<"rewards" | "codes">("rewards")
  const [myCodes, setMyCodes] = useState<LoyaltyCode[]>([])
  const [generating, setGenerating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = () => {
    if (!token) return
    getCustomerStats(token)
      .then((s) => setPoints(s.points))
      .catch(() => setPoints(0))
    listLoyaltyCodes(token)
      .then(setMyCodes)
      .catch(() => setMyCodes([]))
  }

  useEffect(() => {
    if (!isOpen || !token) return
    setPoints(null)
    setView("rewards")
    setError(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token])

  if (!isOpen) return null

  const name = userData?.pseudo ?? "Invité"
  const balance = points ?? 0

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
    setPoints(res.remaining)
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
      role="dialog"
      aria-modal="true"
      aria-label="Espace fidélité"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-3xl border border-accent/40 bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-balance">Espace fidélité</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Membre + solde */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-background/60 p-4">
          <div>
            <div className="text-xs text-muted-foreground">Membre</div>
            <div className="font-mono text-lg font-bold">{name}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-accent">
              {points === null ? <Loader2 className="ml-auto h-6 w-6 animate-spin" aria-hidden="true" /> : balance}
            </div>
            <div className="text-xs text-muted-foreground">points (1€ = 1 pt)</div>
          </div>
        </div>

        {/* Onglets */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setView("rewards")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              view === "rewards" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Gift className="h-4 w-4" aria-hidden="true" /> Récompenses
          </button>
          <button
            onClick={() => setView("codes")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              view === "codes" ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Ticket className="h-4 w-4" aria-hidden="true" /> Mes codes
            {myCodes.length > 0 && (
              <span className="rounded-full bg-background/40 px-1.5 text-xs">{myCodes.length}</span>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {view === "rewards" ? (
            <div className="flex flex-col gap-3">
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
                        <Gift className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="font-semibold">{reward.label} de réduction</div>
                        <div className="text-xs text-muted-foreground">
                          {reward.points} points · dès {reward.minAmount}€ d'achat
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
          ) : (
            <div className="flex flex-col gap-3">
              {myCodes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucun code généré. Échange tes points dans l'onglet Récompenses.
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
          )}
        </div>
      </div>
    </div>
  )
}
