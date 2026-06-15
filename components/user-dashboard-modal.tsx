"use client"

import { X, LogOut } from "lucide-react"

type UserData = { pseudo?: string } | null

type UserDashboardModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
  onLogout: () => void
}

export function UserDashboardModal({ isOpen, onClose, userData, onLogout }: UserDashboardModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mon espace"
    >
      <div className="w-full max-w-md rounded-3xl border border-accent/40 bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Mon espace</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-border bg-background/60 p-6">
          <div className="text-sm text-muted-foreground">Pseudo anonyme</div>
          <div className="mt-1 font-mono text-2xl font-bold">{userData?.pseudo ?? "Invité"}</div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-4 text-center">
          <div className="rounded-2xl bg-background/40 p-4">
            <div className="text-2xl font-bold text-accent">248</div>
            <div className="mt-1 text-xs text-muted-foreground">Points</div>
          </div>
          <div className="rounded-2xl bg-background/40 p-4">
            <div className="text-2xl font-bold text-primary">1</div>
            <div className="mt-1 text-xs text-muted-foreground">En cours</div>
          </div>
          <div className="rounded-2xl bg-background/40 p-4">
            <div className="text-2xl font-bold text-muted-foreground">14</div>
            <div className="mt-1 text-xs text-muted-foreground">Passées</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive py-4 font-semibold text-background transition-opacity hover:opacity-90"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
