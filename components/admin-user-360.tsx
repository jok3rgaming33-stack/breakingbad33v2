"use client"

import { useEffect, useState } from "react"
import { getUser360, type User360Data } from "@/app/actions/user-360"
import { validateAndPurge, rejectVerification } from "@/app/actions/verification"
import { OrderStatusTimeline } from "@/components/order-status-timeline"
import { statusMeta } from "@/lib/order-status"
import {
  X,
  Loader2,
  MapPin,
  Package,
  Gift,
  Shield,
  Activity,
  MessageSquare,
  Copy,
  Check,
  ShieldCheck,
  XCircle,
  Image as ImageIcon,
  Video,
} from "lucide-react"

function verificationFileUrl(pathname: string) {
  return `/api/verification/file?pathname=${encodeURIComponent(pathname)}`
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type Props = {
  userId: number
  onClose: () => void
}

export function AdminUser360({ userId, onClose }: Props) {
  const [data, setData] = useState<User360Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [kycBusy, setKycBusy] = useState(false)
  const [kycMsg, setKycMsg] = useState<string | null>(null)
  const [kycErr, setKycErr] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const reload = () => {
    setLoading(true)
    setError("")
    getUser360(userId)
      .then((res) => {
        if (!res.ok) setError(res.error || "Erreur de chargement.")
        else setData(res.data)
      })
      .catch(() => setError("Erreur de chargement."))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    setData(null)
    setKycMsg(null)
    setKycErr(null)
    setRejectOpen(false)
    getUser360(userId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setError(res.error || "Erreur de chargement.")
          return
        }
        setData(res.data)
      })
      .catch(() => {
        if (!cancelled) setError("Erreur de chargement.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const handleValidateKyc = async () => {
    if (!data?.verification || data.verification.status !== "pending" || kycBusy) return
    if (!window.confirm(`Valider le KYC de ${data.pseudo} ? La vidéo sera purgée, la photo conservée.`)) return
    setKycBusy(true)
    setKycMsg(null)
    setKycErr(null)
    try {
      const res = await validateAndPurge(data.verification.id)
      if (!res.ok) {
        setKycErr(res.error ?? "Échec validation.")
        return
      }
      setKycMsg("Vérification validée.")
      setData((prev) =>
        prev && prev.verification
          ? {
              ...prev,
              verification: {
                ...prev.verification,
                status: "validated",
                validatedAt: new Date().toISOString(),
                videoPathname: null,
              },
            }
          : prev,
      )
    } catch {
      setKycErr("Erreur réseau.")
    } finally {
      setKycBusy(false)
    }
  }

  const handleRejectKyc = async () => {
    if (!data?.verification || data.verification.status !== "pending" || kycBusy) return
    const reason = rejectReason.trim()
    if (!reason) {
      setKycErr("Justification requise pour le refus.")
      return
    }
    setKycBusy(true)
    setKycMsg(null)
    setKycErr(null)
    try {
      const res = await rejectVerification(data.verification.id, reason)
      if (!res.ok) {
        setKycErr("Échec du refus.")
        return
      }
      setKycMsg("Vérification refusée — le client peut resoumettre.")
      setRejectOpen(false)
      setRejectReason("")
      setData((prev) => (prev ? { ...prev, verification: null } : prev))
    } catch {
      setKycErr("Erreur réseau.")
    } finally {
      setKycBusy(false)
    }
  }

  const copyToken = async () => {
    if (!data?.token) return
    try {
      await navigator.clipboard.writeText(data.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-background/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fiche client 360"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold sm:text-lg">Fiche client 360°</h2>
            <p className="truncate text-xs text-muted-foreground">
              Compte · commandes · connexions
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : error || !data ? (
            <div className="space-y-3 py-10 text-center">
              <p className="text-sm text-destructive">{error || "Erreur"}</p>
              <button
                type="button"
                onClick={reload}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl font-bold">{data.pseudo}</p>
                    {data.nickname && (
                      <p className="text-sm text-muted-foreground">Surnom : {data.nickname}</p>
                    )}
                    <button
                      type="button"
                      onClick={copyToken}
                      className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-secondary"
                      title="Copier le token"
                    >
                      <span className="truncate">{data.token.slice(0, 16)}…</span>
                      {copied ? (
                        <Check className="h-3 w-3 shrink-0 text-accent" />
                      ) : (
                        <Copy className="h-3 w-3 shrink-0" />
                      )}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">Inscrit le {formatDate(data.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${data.tier.tier.color}`}>
                      {data.tier.tier.emoji ? `${data.tier.tier.emoji} ` : ""}
                      {data.tier.tier.label}
                      {data.tier.tier.pointsMultiplier > 1 ? ` · ×${data.tier.tier.pointsMultiplier}` : ""}
                    </span>
                    {data.flags.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium"
                      >
                        {f}
                      </span>
                    ))}
                    {data.mustSetPassword && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
                        mdp à définir
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Points", value: data.points },
                    { label: "CA livré", value: `${data.totalSpentDelivered}€` },
                    { label: "Commandes", value: data.orderCount },
                    { label: "Actives", value: data.activeOrders },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className="text-lg font-bold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5 shrink-0" /> Code parrain :{" "}
                    <span className="font-mono font-semibold text-foreground">{data.referralCode || "—"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" /> {data.discussionCount} disc. ·{" "}
                    {data.unreadVendorMessages} non lu(s)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 shrink-0" /> KYC :{" "}
                    {data.verification ? data.verification.status : "aucune"}
                  </span>
                </div>
              </section>

              {/* Vérification d'identité — validation directe */}
              <section className="rounded-2xl border border-border bg-background/50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                  Vérification d&apos;identité
                </h3>

                {!data.verification ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune vérification soumise pour ce compte.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold ${
                          data.verification.status === "validated"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : data.verification.status === "pending"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {data.verification.status === "pending"
                          ? "En attente"
                          : data.verification.status === "validated"
                            ? "Validée"
                            : data.verification.status}
                      </span>
                      <span className="text-muted-foreground">
                        Soumise le {formatDate(data.verification.createdAt)}
                      </span>
                      {data.verification.validatedAt && (
                        <span className="text-muted-foreground">
                          · validée le {formatDate(data.verification.validatedAt)}
                        </span>
                      )}
                    </div>

                    {(data.verification.photoPathname || data.verification.videoPathname) && (
                      <div className="flex flex-wrap gap-2">
                        {data.verification.photoPathname && (
                          <a
                            href={verificationFileUrl(data.verification.photoPathname)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium hover:border-accent/40"
                          >
                            <ImageIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            Voir la photo
                          </a>
                        )}
                        {data.verification.videoPathname && (
                          <a
                            href={verificationFileUrl(data.verification.videoPathname)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium hover:border-accent/40"
                          >
                            <Video className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            Voir la vidéo
                          </a>
                        )}
                      </div>
                    )}

                    {kycMsg && (
                      <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                        {kycMsg}
                      </p>
                    )}
                    {kycErr && (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {kycErr}
                      </p>
                    )}

                    {data.verification.status === "pending" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={kycBusy}
                            onClick={() => void handleValidateKyc()}
                            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {kycBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Valider la vérification
                          </button>
                          <button
                            type="button"
                            disabled={kycBusy}
                            onClick={() => {
                              setRejectOpen((v) => !v)
                              setKycErr(null)
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Refuser
                          </button>
                        </div>

                        {rejectOpen && (
                          <div className="rounded-xl border border-border bg-card p-3">
                            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                              Justification (envoyée au client)
                            </label>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              rows={3}
                              placeholder="Ex. photo floue, site non visible…"
                              className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
                            />
                            <button
                              type="button"
                              disabled={kycBusy || !rejectReason.trim()}
                              onClick={() => void handleRejectKyc()}
                              className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                            >
                              Confirmer le refus
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Package className="h-4 w-4 text-accent" aria-hidden="true" />
                  Commandes récentes
                </h3>
                {data.orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune commande.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.orders.slice(0, 6).map((o) => {
                      const meta = statusMeta(o.status)
                      return (
                        <li key={o.id} className="rounded-2xl border border-border bg-background/40 p-3">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                #{o.id} · {o.total}€ · {o.fulfillment}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{o.summary}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>
                          <OrderStatusTimeline status={o.status} fulfillment={o.fulfillment} compact />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
                  Dernières connexions
                </h3>
                {data.recentLogins.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune connexion journalisée.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border">
                    {data.recentLogins.slice(0, 8).map((l) => (
                      <li key={l.id} className="flex flex-col gap-0.5 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {[l.city, l.country].filter(Boolean).join(", ") || l.ip || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground">
                          <span title="Connexion">{formatDate(l.createdAt)}</span>
                          <span className="mx-1 text-border">→</span>
                          {l.loggedOutAt ? (
                            <span title="Déconnexion">{formatDate(l.loggedOutAt)}</span>
                          ) : (
                            <span className="text-emerald-400">en ligne</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {data.loyaltyCodes.length > 0 && (
                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Gift className="h-4 w-4 text-accent" aria-hidden="true" />
                    Codes fidélité
                  </h3>
                  <ul className="space-y-1.5">
                    {data.loyaltyCodes.map((c) => (
                      <li
                        key={c.code}
                        className={`flex justify-between rounded-xl border px-3 py-2 font-mono text-xs ${
                          c.used ? "border-border opacity-50" : "border-accent/30 bg-accent/5"
                        }`}
                      >
                        <span className="truncate">{c.code}</span>
                        <span className="shrink-0">
                          -{c.discount}€ {c.used ? "· utilisé" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
