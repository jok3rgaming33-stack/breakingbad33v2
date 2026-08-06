"use client"

import { useEffect, useState } from "react"
import { getMyRecoveryStatus } from "@/app/actions/lost-key"
import { KeyRound, Loader2, MessageSquare, ShieldCheck } from "lucide-react"
import Link from "next/link"

type Props = {
  token?: string
  onOpenMessaging?: () => void
}

/**
 * Bannière pour les clients en récupération de compte (clé perdue).
 * KYC + messagerie en premier plan (validation admin en direct).
 */
export function RecoveryBanner({ token, onOpenMessaging }: Props) {
  const [status, setStatus] = useState<{
    active: boolean
    status: string | null
    claimedPseudo: string | null
    needsKyc: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setStatus(null)
      return
    }
    let cancelled = false
    setLoading(true)
    getMyRecoveryStatus(token)
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading || !status?.active) return null

  const waitingAdmin = status.status === "kyc_submitted"

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-100">
              Récupération de compte
              {status.claimedPseudo ? ` — ${status.claimedPseudo}` : ""}
            </p>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              {status.needsKyc
                ? "Clé provisoire active. Fais le KYC pour validation admin en direct. Tu peux déjà écrire et recevoir des réponses en messagerie."
                : waitingAdmin
                  ? "KYC envoyé — l'admin peut valider maintenant. Messagerie ouverte dans les deux sens."
                  : "Dossier en cours. Messagerie ouverte."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {onOpenMessaging && (
            <button
              type="button"
              onClick={onOpenMessaging}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-background/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-background/60"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              Messagerie
            </button>
          )}
          {status.needsKyc && (
            <Link
              href="/verification?from=recovery"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-black hover:brightness-110"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Faire le KYC
            </Link>
          )}
          {waitingAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 px-3 py-2 text-xs text-amber-100/90">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              En attente admin
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
