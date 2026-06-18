"use client"

import { useMemo, useState } from "react"
import type { AdminUserRow } from "@/app/actions/account"
import { deleteUserAccount, setLoyaltyAdjustment } from "@/app/actions/account"
import { Users, Search, Trash2, Loader2, ShoppingBag, Coins, AlertTriangle, Pencil, Check, X } from "lucide-react"
import { computeLoyaltyPoints } from "@/lib/loyalty"

function formatDate(value: Date | string) {
  const d = new Date(value)
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function shortToken(token: string) {
  if (token.length <= 14) return token
  return `${token.slice(0, 8)}…${token.slice(-4)}`
}

export function AdminUsers({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers)
  const [query, setQuery] = useState("")
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null)
  // Édition des points fidélité : on saisit le total souhaité, on stocke l'ajustement.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [savingId, setSavingId] = useState<number | null>(null)

  const totalPoints = (u: AdminUserRow) => Math.max(0, computeLoyaltyPoints(u.totalSpent) + u.loyaltyAdjustment)

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.id)
    setEditValue(String(totalPoints(u)))
  }

  const handleSavePoints = async (u: AdminUserRow) => {
    const desired = Number.parseInt(editValue, 10)
    if (!Number.isFinite(desired) || desired < 0) return
    const adjustment = desired - computeLoyaltyPoints(u.totalSpent)
    setSavingId(u.id)
    try {
      const res = await setLoyaltyAdjustment(u.id, adjustment)
      if (res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, loyaltyAdjustment: res.loyaltyAdjustment } : x)))
        setEditingId(null)
      }
    } finally {
      setSavingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.pseudo.toLowerCase().includes(q) || u.token.toLowerCase().includes(q),
    )
  }, [users, query])

  const handleDelete = async (user: AdminUserRow) => {
    setPendingId(user.id)
    try {
      const res = await deleteUserAccount(user.id)
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id))
      }
    } finally {
      setPendingId(null)
      setConfirmUser(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Répertoire des comptes</h2>
            <p className="text-xs text-muted-foreground">
              Tous les accès anonymes enregistrés. La suppression est définitive.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
          <div className="text-xl font-bold">{users.length}</div>
          <div className="text-[11px] text-muted-foreground">Comptes</div>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (pseudo, token)…"
          className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pseudo</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
                <th className="px-4 py-3 font-medium">Commandes</th>
                <th className="px-4 py-3 font-medium">Points</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Aucun compte à afficher.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3 font-medium">{u.pseudo}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-xs">
                        {shortToken(u.token)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ShoppingBag className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        {u.orderCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSavePoints(u)
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            autoFocus
                            className="w-20 rounded-lg border border-accent bg-background px-2 py-1 text-xs outline-none"
                            aria-label={`Points fidélité de ${u.pseudo}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePoints(u)}
                            disabled={savingId === u.id}
                            className="rounded-md bg-accent p-1 text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            aria-label="Enregistrer"
                          >
                            {savingId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary"
                            aria-label="Annuler"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                            <Coins className="h-3 w-3" aria-hidden="true" />
                            {totalPoints(u)}
                          </span>
                          {u.loyaltyAdjustment !== 0 && (
                            <span className="text-[10px] text-muted-foreground" title="Ajustement manuel appliqué">
                              ({u.loyaltyAdjustment > 0 ? "+" : ""}
                              {u.loyaltyAdjustment})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label={`Modifier les points de ${u.pseudo}`}
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirmUser(u)}
                        disabled={pendingId === u.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                      >
                        {pendingId === u.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation de suppression */}
      {confirmUser && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression"
        >
          <div className="w-full max-w-sm rounded-3xl border border-destructive/40 bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">Supprimer ce compte ?</h3>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Le compte{" "}
              <span className="font-semibold text-foreground">{confirmUser.pseudo}</span> sera
              définitivement supprimé du répertoire. Ses commandes déjà passées restent conservées dans
              l&apos;historique.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmUser(null)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmUser)}
                disabled={pendingId === confirmUser.id}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pendingId === confirmUser.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
