"use client"

import { useState } from "react"
import type { VerificationRow } from "@/app/actions/verification"
import { validateAndPurge, deleteVerificationPhoto } from "@/app/actions/verification"
import { ShieldCheck, ShieldAlert, Loader2, Check, Image as ImageIcon, Video, Trash2, AlertTriangle } from "lucide-react"

function fileUrl(pathname: string) {
  return `/api/verification/file?pathname=${encodeURIComponent(pathname)}`
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AdminVerifications({ initialVerifications }: { initialVerifications: VerificationRow[] }) {
  const [rows, setRows] = useState<VerificationRow[]>(initialVerifications)
  const [confirm, setConfirm] = useState<VerificationRow | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [photoView, setPhotoView] = useState<VerificationRow | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const pending = rows.filter((r) => r.status === "pending")
  const validated = rows.filter((r) => r.status === "validated")

  const handleDeletePhoto = async (row: VerificationRow) => {
    if (!window.confirm(`Supprimer définitivement la photo de ${row.pseudo ?? "ce client"} ?`)) return
    setDeletingId(row.id)
    try {
      const res = await deleteVerificationPhoto(row.id)
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, photoPathname: null, videoPathname: null } : r)),
        )
        setPhotoView(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const handleValidate = async (row: VerificationRow) => {
    setPendingId(row.id)
    try {
      const res = await validateAndPurge(row.id)
      if (res.ok) {
        // La vidéo est supprimée ; la photo est conservée et reste consultable.
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "validated", videoPathname: null } : r)),
        )
      }
    } finally {
      setPendingId(null)
      setConfirm(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Vérifications d&apos;identité</h2>
            <p className="text-xs text-muted-foreground">
              Selfies de 1re commande. Valider la 1re livraison supprime la vidéo&nbsp;; la photo reste consultable.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="text-xl font-bold text-accent">{pending.length}</div>
            <div className="text-[11px] text-muted-foreground">En attente</div>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
            <div className="text-xl font-bold text-muted-foreground">{validated.length}</div>
            <div className="text-[11px] text-muted-foreground">Validées</div>
          </div>
        </div>
      </div>

      {pending.length === 0 && validated.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground">
          Aucune vérification soumise pour le moment.
        </div>
      )}

      {/* En attente */}
      {pending.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pending.map((row) => (
            <div key={row.id} className="overflow-hidden rounded-2xl border border-accent/30 bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="font-semibold">{row.pseudo ?? "Client"}</div>
                  <div className="text-[11px] text-muted-foreground">Soumis le {formatDate(row.createdAt)}</div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                  <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  En attente
                </span>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border">
                <div className="bg-card p-2">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <ImageIcon className="h-3 w-3" aria-hidden="true" />
                    Photo
                  </div>
                  {row.photoPathname ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(row.photoPathname) || "/placeholder.svg"}
                      alt={`Selfie photo de ${row.pseudo ?? "client"}`}
                      className="aspect-[3/4] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-background/40 text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="bg-card p-2">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Video className="h-3 w-3" aria-hidden="true" />
                    Vidéo
                  </div>
                  {row.videoPathname ? (
                    <video
                      src={fileUrl(row.videoPathname)}
                      controls
                      playsInline
                      className="aspect-[3/4] w-full rounded-lg bg-black object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-background/40 text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 text-xs text-muted-foreground">
                <div>
                  Site prononcé&nbsp;: <span className="font-medium text-foreground">{row.siteName ?? "—"}</span>
                </div>
                <div>
                  Date/heure prononcée&nbsp;: <span className="font-medium text-foreground">{row.recordedAt ?? "—"}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setConfirm(row)}
                disabled={pendingId === row.id}
                className="flex w-full items-center justify-center gap-2 border-t border-border bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pendingId === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Valider la 1re livraison
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Validées : photo conservée, consultable à la demande. */}
      {validated.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Vérifications validées</div>
          <ul className="divide-y divide-border">
            {validated.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{row.pseudo ?? "Client"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Validée{row.recordedAt ? ` · ${row.recordedAt}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Vidéo supprimée
                  </span>
                  {row.photoPathname ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPhotoView(row)}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Voir la photo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(row)}
                        disabled={deletingId === row.id}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Supprimer la photo
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Photo indisponible</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirmation */}
      {confirm && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la validation"
        >
          <div className="w-full max-w-sm rounded-3xl border border-accent/40 bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">Valider la 1re livraison ?</h3>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              La vidéo de{" "}
              <span className="font-semibold text-foreground">{confirm.pseudo ?? "ce client"}</span> sera{" "}
              <span className="font-semibold text-foreground">définitivement supprimée</span>. La photo sera conservée
              et restera consultable depuis ce panel. Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleValidate(confirm)}
                disabled={pendingId === confirm.id}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pendingId === confirm.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Valider la livraison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualisation de la photo conservée */}
      {photoView && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo de vérification"
          onClick={() => setPhotoView(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="font-semibold">{photoView.pseudo ?? "Client"}</div>
              <button
                type="button"
                onClick={() => setPhotoView(null)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
              >
                Fermer
              </button>
            </div>
            {photoView.photoPathname && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl(photoView.photoPathname) || "/placeholder.svg"}
                alt={`Selfie photo de ${photoView.pseudo ?? "client"}`}
                className="max-h-[70vh] w-full object-contain bg-black"
              />
            )}
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => handleDeletePhoto(photoView)}
                disabled={deletingId === photoView.id}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
              >
                {deletingId === photoView.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Supprimer définitivement la photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
