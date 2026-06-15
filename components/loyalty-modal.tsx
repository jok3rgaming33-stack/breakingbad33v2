"use client"

import { useState } from "react"
import { X, KeyRound, Gift, Check, Copy, ArrowLeft } from "lucide-react"

type UserData = { pseudo?: string } | null

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

// Solde de points (à remplacer par une vraie source plus tard)
const POINTS_BALANCE = 248

function generateRewardCode(discount: number) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `BB33-${discount}E-${random}`
}

export function LoyaltyModal({ isOpen, onClose, userData }: LoyaltyModalProps) {
  const [step, setStep] = useState<"login" | "space">("login")
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null)
  const [generatedCode, setGeneratedCode] = useState("")
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const name = userData?.pseudo ?? "Invité"

  const handleClose = () => {
    // Réinitialise l'état à la fermeture
    setStep("login")
    setToken("")
    setError("")
    setSelectedReward(null)
    setGeneratedCode("")
    setCopied(false)
    onClose()
  }

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (token.trim().length < 4) {
      setError("Token invalide. Saisis au moins 4 caractères.")
      return
    }
    setError("")
    setStep("space")
  }

  const handleSelectReward = (reward: Reward) => {
    if (POINTS_BALANCE < reward.points) return
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

        {/* Étape 1 : login par token */}
        {step === "login" && (
          <form onSubmit={handleTokenSubmit}>
            <label htmlFor="loyalty-token" className="mb-2 block text-sm font-medium text-muted-foreground">
              Saisis ton token pour accéder à ton espace fidélité
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="loyalty-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Ton token fidélité"
                className="w-full rounded-2xl border border-border bg-background/60 py-4 pl-12 pr-4 font-mono text-foreground outline-none transition-colors focus:border-accent"
                autoComplete="off"
              />
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Accéder à mon espace
            </button>
          </form>
        )}

        {/* Étape 2 : espace fidélité + choix d'avantage */}
        {step === "space" && (
          <div>
            <div className="mb-6 rounded-2xl bg-background/40 p-4 text-center">
              <div className="text-3xl font-bold text-accent">{POINTS_BALANCE}</div>
              <div className="mt-1 text-xs text-muted-foreground">Points disponibles</div>
            </div>

            {!selectedReward ? (
              <>
                <div className="mb-3 text-sm font-medium text-muted-foreground">Choisis ton avantage</div>
                <div className="flex flex-col gap-3">
                  {REWARDS.map((reward) => {
                    const affordable = POINTS_BALANCE >= reward.points
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
                  Ton code unique à saisir lors de la commande
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
        )}
      </div>
    </div>
  )
}
