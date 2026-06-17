"use client"

import { useEffect, useState } from "react"
import { X, Gift, Check, Copy, ArrowLeft, Loader2 } from "lucide-react"
import { getCustomerStats } from "@/app/actions/account"

type UserData = { pseudo?: string; token?: string } | null

type LoyaltyModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
}

type Reward = {
  points: number
  discount: number
  label: string
}

const REWARDS: Reward[] = [
  { points: 30, discount: 10, label: "-10€" },
  { points: 60, discount: 20, label: "-20€" },
  { points: 100, discount: 30, label: "-30€" },
]

function generateRewardCode(discount: number) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `BB33-${discount}E-${random}`
}

export function LoyaltyModal({ isOpen, onClose, userData }: LoyaltyModalProps) {
  const token = userData?.token ?? ""
  const [points, setPoints] = useState<number | null>(null)
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null)
  const [generatedCode, setGeneratedCode] = useState("")
  const [copied, setCopied] = useState(false)

  // Charge le solde de points réel du client (depuis ses commandes)
  useEffect(() => {
    if (!isOpen || !token) return
    setPoints(null)
    getCustomerStats(token)
      .then((s) => setPoints(s.points))
      .catch(() => setPoints(0))
  }, [isOpen, token])

  if (!isOpen) return null

  const name = userData?.pseudo ?? "Invité"
  const balance = points ?? 0

  const handleClose = () => {
    // Réinitialise l'état à la fermeture
    setSelectedReward(null)
    setGeneratedCode("")
    setCopied(false)
    onClose()
  }

  const handleSelectReward = (reward: Reward) => {
    if (balance < reward.points) return
    setSelectedReward(reward)
    setGeneratedCode(generateRewardCode(reward.discount))
    setCopied(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Espace fidélité"
    >
      <div className="w-full max-w-md rounded-3xl border border-accent/40 bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
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

        {/* Nom de l'utilisateur */}
        <div className="mb-6 rounded-2xl border border-border bg-background/60 p-6">
          <div className="text-sm text-muted-foreground">Membre</div>
          <div className="mt-1 font-mono text-2xl font-bold">{name}</div>
        </div>

        {/* Espace fidélité + choix d'avantage */}
        <div>
            <div className="mb-6 rounded-2xl bg-background/40 p-4 text-center">
              <div className="text-3xl font-bold text-accent">
                {points === null ? (
                  <Loader2 className="mx-auto h-7 w-7 animate-spin" aria-hidden="true" />
                ) : (
                  points
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Points disponibles</div>
            </div>

            {!selectedReward ? (
              <>
                <div className="mb-3 text-sm font-medium text-muted-foreground">Choisis ton avantage</div>
                <div className="flex flex-col gap-3">
                  {REWARDS.map((reward) => {
                    const affordable = balance >= reward.points
                    return (
                      <button
                        key={reward.points}
                        type="button"
                        onClick={() => handleSelectReward(reward)}
                        disabled={!affordable}
                        className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                            <Gift className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div>
                            <div className="font-semibold">{reward.label} de réduction</div>
                            <div className="text-xs text-muted-foreground">{reward.points} points</div>
                          </div>
                        </div>
                        {!affordable && <span className="text-xs text-muted-foreground">Indisponible</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 p-4">
                  <Check className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div className="text-sm">
                    Avantage <span className="font-semibold">{selectedReward.label}</span> activé pour{" "}
                    <span className="font-semibold">{selectedReward.points} points</span>.
                  </div>
                </div>

                <div className="mb-2 text-sm font-medium text-muted-foreground">
                  Ton code unique �� saisir lors de la commande
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4">
                  <span className="font-mono text-lg font-bold tracking-wider">{generatedCode}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                    aria-label="Copier le code"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedReward(null)
                    setGeneratedCode("")
                    setCopied(false)
                  }}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 font-semibold text-secondary-foreground transition-colors hover:bg-muted"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Choisir un autre avantage
                </button>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}
