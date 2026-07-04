"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import type { AdminUserRow } from "@/app/actions/account"
import { deleteUserAccount, setLoyaltyAdjustment, setUserFlags } from "@/app/actions/account"
import { Users, Search, Trash2, Loader2, ShoppingBag, Coins, AlertTriangle, Pencil, Check, X, Copy, Tag, ChevronDown, MessageSquare, Send } from "lucide-react"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { createGeneralInquiryThread } from "@/app/actions/messaging"

// Étiquettes (flags) sélectionnables pour signaler un compte.
const FLAG_OPTIONS: { value: string; label: string; className: string }[] = [
  { value: "absent", label: "Absent lors de la livraison", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  { value: "suspect", label: "Profil suspect", className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  { value: "fidele", label: "Client fidèle", className: "bg-accent/15 text-accent border-accent/30" },
  { value: "banni", label: "Banni(e)", className: "bg-destructive/15 text-destructive border-destructive/30" },
]

function flagMeta(value: string) {
  return FLAG_OPTIONS.find((f) => f.value === value)
}

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

// Menu déroulant multi-sélection des signalements d'un compte.
function FlagSelector({
  user,
  onToggle,
}: {
  user: AdminUserRow
  onToggle: (u: AdminUserRow, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary"
      >
        {user.flags.length === 0 ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            Aucun
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {user.flags.map((f) => {
              const m = flagMeta(f)
              return (
                <span key={f} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m?.className ?? ""}`}>
                  {m?.label ?? f}
                </span>
              )
            })}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          {FLAG_OPTIONS.map((opt) => {
            const active = user.flags.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(user, opt.value)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary"
              >
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${opt.className}`}>{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [contactUser, setContactUser] = useState<AdminUserRow | null>(null)
  const [contactMsg, setContactMsg] = useState("")
  const [contactSending, setContactSending] = useState(false)
  const [contactDone, setContactDone] = useState(false)

  const totalPoints = (u: AdminUserRow) => Math.max(0, computeLoyaltyPoints(u.totalSpent) + u.loyaltyAdjustment)

  const copyToken = async (u: AdminUserRow) => {
    let ok = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(u.token)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea")
        ta.value = u.token
        ta.style.position = "fixed"
        ta.style.top = "-9999px"
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand("copy")
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopiedId(u.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const toggleFlag = async (u: AdminUserRow, value: string) => {
    const next = u.flags.includes(value) ? u.flags.filter((f) => f !== value) : [...u.flags, value]
    // Optimiste : on met à jour l'UI puis on persiste.
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, flags: next } : x)))
    const res = await setUserFlags(u.id, next)
    if (!res.ok) {
      // Revert en cas d'échec.
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, flags: u.flags } : x)))
    }
  }

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

  const handleContact = async () => {
    if (!contactUser || !contactMsg.trim()) return
    setContactSending(true)
    try {
      const res = await createGeneralInquiryThread({
        customerName: contactUser.pseudo,
        customerToken: contactUser.token,
        message: `[Message de l'équipe] ${contactMsg.trim()}`,
      })
      if (res.ok) {
        setContactDone(true)
        setContactMsg("")
        setTimeout(() => {
          setContactUser(null)
          setContactDone(false)
        }, 2000)
      }
    } finally {
      setContactSending(false)
    }
  }

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
                <th className="px-4 py-3 font-medium">Signalement</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
                <th className="px-4 py-3 font-medium">Commandes</th>
                <th className="px-4 py-3 font-medium">Points</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Aucun compte à afficher.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3 font-medium">{u.pseudo}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => copyToken(u)}
                        title="Copier le token complet"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-xs transition-colors hover:bg-secondary"
                      >
                        {shortToken(u.token)}
                        {copiedId === u.id ? (
                          <Check className="h-3 w-3 text-accent" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <FlagSelector user={u} onToggle={toggleFlag} />
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setContactUser(u); setContactMsg(""); setContactDone(false) }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                        >
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          Contacter
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale de contact client */}
      {contactUser && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Contacter ${contactUser.pseudo}`}
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <MessageSquare className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-bold">Contacter un client</h3>
                  <p className="text-xs text-muted-foreground">
                    Un fil de messagerie sera ouvert avec{" "}
                    <span className="font-semibold text-foreground">{contactUser.pseudo}</span>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContactUser(null)}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {contactDone ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Check className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="font-semibold">Message envoyé !</p>
                <p className="text-sm text-muted-foreground">
                  Le fil de messagerie est ouvert. Le client recevra une notification push.
                </p>
              </div>
            ) : (
              <>
                <textarea
                  value={contactMsg}
                  onChange={(e) => setContactMsg(e.target.value)}
                  placeholder={`Écris ton message à ${contactUser.pseudo}…`}
                  rows={4}
                  autoFocus
                  className="w-full resize-none rounded-xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
                />
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setContactUser(null)}
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleContact}
                    disabled={contactSending || !contactMsg.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {contactSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                    Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
