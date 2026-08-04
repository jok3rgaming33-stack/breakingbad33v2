"use client"

import { useEffect, useState } from "react"
import {
  listRecoveryClaims,
  approveRecoveryClaim,
  rejectRecoveryClaim,
  setRecoveryOriginalUser,
  searchUsersByPseudo,
  type RecoveryClaimRow,
} from "@/app/actions/lost-key"
import {
  KeyRound,
  Loader2,
  Check,
  XCircle,
  ShieldAlert,
  Link2,
  Search,
} from "lucide-react"

function statusLabel(s: string) {
  switch (s) {
    case "pending_kyc":
      return "En attente KYC"
    case "kyc_submitted":
      return "KYC soumis"
    case "approved":
      return "Validé"
    case "rejected":
      return "Refusé"
    default:
      return s
  }
}

export function AdminRecovery() {
  const [rows, setRows] = useState<RecoveryClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [searchQ, setSearchQ] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<
    Record<number, { id: number; pseudo: string; tokenPreview: string }[]>
  >({})

  async function refresh() {
    setLoading(true)
    try {
      const data = await listRecoveryClaims()
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const open = rows.filter((r) => r.status === "pending_kyc" || r.status === "kyc_submitted")
  const closed = rows.filter((r) => r.status === "approved" || r.status === "rejected")

  async function handleApprove(claim: RecoveryClaimRow) {
    setBusyId(claim.id)
    setError("")
    try {
      const res = await approveRecoveryClaim(claim.id, claim.originalUserId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject() {
    if (rejectId == null) return
    setBusyId(rejectId)
    setError("")
    try {
      const res = await rejectRecoveryClaim(rejectId, rejectReason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRejectId(null)
      setRejectReason("")
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleSearch(claimId: number) {
    const q = (searchQ[claimId] || "").trim()
    if (q.length < 2) return
    const res = await searchUsersByPseudo(q)
    setSearchResults((prev) => ({ ...prev, [claimId]: res }))
  }

  async function handleLink(claimId: number, userId: number) {
    setBusyId(claimId)
    try {
      await setRecoveryOriginalUser(claimId, userId)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Récupérations de compte</h2>
          <p className="text-xs text-muted-foreground">
            Flux court : clé provisoire + messagerie 2 sens + KYC immédiat → tu valides / fusionnes en direct.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {open.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Aucun dossier de récupération en cours.
        </div>
      ) : (
        <div className="grid gap-4">
          {open.map((claim) => (
            <div
              key={claim.id}
              className="rounded-2xl border border-accent/30 bg-card p-4 sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    Pseudo déclaré : {claim.claimedPseudo}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Créé le {new Date(claim.createdAt).toLocaleString("fr-FR")}
                    {claim.originalPseudo
                      ? ` · Compte lié : ${claim.originalPseudo}`
                      : " · Compte d'origine non lié"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                    {statusLabel(claim.status)}
                  </span>
                  {claim.kycStatus && (
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
                      KYC : {claim.kycStatus}
                    </span>
                  )}
                </div>
              </div>

              {claim.clientMessage && (
                <p className="mb-3 rounded-xl bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                  {claim.clientMessage}
                </p>
              )}

              {/* Association manuelle si pas de match auto */}
              {!claim.originalUserId && (
                <div className="mb-3 rounded-xl border border-border bg-background/40 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <Link2 className="h-3.5 w-3.5" />
                    Associer le compte d&apos;origine
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={searchQ[claim.id] || claim.claimedPseudo}
                      onChange={(e) =>
                        setSearchQ((p) => ({ ...p, [claim.id]: e.target.value }))
                      }
                      className="input flex-1 text-sm"
                      placeholder="Rechercher un pseudo…"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearch(claim.id)}
                      className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-secondary"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Chercher
                    </button>
                  </div>
                  {(searchResults[claim.id] || []).length > 0 && (
                    <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                      {searchResults[claim.id].map((u) => (
                        <li
                          key={u.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span>
                            {u.pseudo}{" "}
                            <span className="text-xs text-muted-foreground">
                              #{u.id} · {u.tokenPreview}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleLink(claim.id, u.id)}
                            className="text-xs font-semibold text-accent"
                          >
                            Lier
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {claim.threadId != null && (
                  <a
                    href="/admin"
                    onClick={(e) => {
                      // bascule vers messagerie admin : stocke le thread à ouvrir
                      try {
                        sessionStorage.setItem("bb33_admin_open_thread", String(claim.threadId))
                        sessionStorage.setItem("bb33_admin_tab", "messagerie")
                      } catch { /* ignore */ }
                    }}
                    className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                  >
                    Répondre au client
                  </a>
                )}
                <button
                  type="button"
                  disabled={busyId === claim.id}
                  onClick={() => handleApprove(claim)}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {busyId === claim.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Valider & fusionner
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectId(claim.id)
                    setRejectReason("")
                  }}
                  className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Historique
          </div>
          <ul className="divide-y divide-border">
            {closed.slice(0, 30).map((c) => (
              <li key={c.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  {c.claimedPseudo}
                  {c.originalPseudo ? ` → ${c.originalPseudo}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{statusLabel(c.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejectId != null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-2 font-bold">Refuser la récupération</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="input mb-3"
              placeholder="Motif (visible par le client)…"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectId(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === rejectId}
                onClick={handleReject}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white"
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
