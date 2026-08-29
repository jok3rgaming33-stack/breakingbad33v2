"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import type { AdminUserRow } from "@/app/actions/account"
import { deleteUserAccount, setLoyaltyAdjustment, setUserDeliveryPreferences, setUserFlags, setUserNickname } from "@/app/actions/account"
import {
  Users,
  Search,
  Trash2,
  Loader2,
  ShoppingBag,
  Coins,
  AlertTriangle,
  Pencil,
  Check,
  X,
  Copy,
  Tag,
  ChevronDown,
  MessageSquare,
  Send,
  KeyRound,
  UserRoundSearch,
  MoreHorizontal,
  ShieldCheck,
  ShieldAlert,
  BellOff,
  Newspaper,
} from "lucide-react"
import { AdminUser360 } from "@/components/admin-user-360"
import { computeLoyaltyPoints } from "@/lib/loyalty"
import { createGeneralInquiryThread } from "@/app/actions/messaging"
import { grantRestoreAccess } from "@/app/actions/restore-access"
import { validateAndPurge, adminForceValidateKyc } from "@/app/actions/verification"

const FLAG_OPTIONS: { value: string; label: string; short: string; className: string }[] = [
  { value: "absent", label: "Absent lors de la livraison", short: "Absent", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  { value: "suspect", label: "Profil suspect", short: "Suspect", className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  { value: "fidele", label: "Client fidèle", short: "Fidèle", className: "bg-accent/15 text-accent border-accent/30" },
  { value: "banni", label: "Banni(e)", short: "Banni", className: "bg-destructive/15 text-destructive border-destructive/30" },
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

function DeliveryPreferences({
  user,
  onChange,
}: {
  user: AdminUserRow
  onChange: (u: AdminUserRow, preference: "excludeNews" | "excludeNotifications") => void
}) {
  return (
    <div className="flex items-center gap-1" aria-label={`Préférences d'envoi de ${user.pseudo}`}>
      <button type="button" onClick={() => onChange(user, "excludeNews")} title={user.excludeNews ? "Réactiver les news" : "Retirer des news"} aria-pressed={user.excludeNews} className={`rounded-md border p-1.5 transition-colors ${user.excludeNews ? "border-amber-500/40 bg-amber-500/15 text-amber-400" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
        <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{user.excludeNews ? "Réactiver les news" : "Retirer des news"}</span>
      </button>
      <button type="button" onClick={() => onChange(user, "excludeNotifications")} title={user.excludeNotifications ? "Réactiver les notifications" : "Retirer des notifications"} aria-pressed={user.excludeNotifications} className={`rounded-md border p-1.5 transition-colors ${user.excludeNotifications ? "border-amber-500/40 bg-amber-500/15 text-amber-400" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
        <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{user.excludeNotifications ? "Réactiver les notifications" : "Retirer des notifications"}</span>
      </button>
    </div>
  )
}

function FlagSelector({
  user,
  onToggle,
  compact = false,
}: {
  user: AdminUserRow
  onToggle: (u: AdminUserRow, value: string) => void
  compact?: boolean
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
        className={`flex items-center gap-1 rounded-lg border border-border bg-background/60 text-xs transition-colors hover:bg-secondary ${
          compact ? "max-w-full px-2 py-1" : "max-w-[200px] px-2.5 py-1.5"
        }`}
        title="Signalements"
      >
        {user.flags.length === 0 ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {!compact && "Aucun"}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {user.flags.map((f) => {
              const m = flagMeta(f)
              return (
                <span
                  key={f}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${m?.className ?? ""}`}
                >
                  {compact ? m?.short ?? f : m?.label ?? f}
                </span>
              )
            })}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-xl border border-border bg-card p-1.5 shadow-lg">
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

/** Menu ⋯ pour actions secondaires (évite la troncature) */
function RowActionsMenu({
  user,
  onContact,
  onRestore,
  onDelete,
  restoreBusy,
}: {
  user: AdminUserRow
  onContact: () => void
  onRestore: () => void
  onDelete: () => void
  restoreBusy: boolean
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Plus d'actions"
        title="Plus d'actions"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onContact()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium hover:bg-secondary"
          >
            <MessageSquare className="h-3.5 w-3.5 text-accent" />
            Contacter
          </button>
          <button
            type="button"
            disabled={restoreBusy}
            onClick={() => {
              setOpen(false)
              onRestore()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-amber-400 hover:bg-secondary disabled:opacity-50"
          >
            {restoreBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Lien récupération
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-destructive hover:bg-secondary"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </button>
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [savingId, setSavingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [contactUser, setContactUser] = useState<AdminUserRow | null>(null)
  const [contactMsg, setContactMsg] = useState("")
  const [contactSending, setContactSending] = useState(false)
  const [contactDone, setContactDone] = useState(false)
  const [restoreUser, setRestoreUser] = useState<AdminUserRow | null>(null)
  const [restoreUrl, setRestoreUrl] = useState("")
  const [restoreSending, setRestoreSending] = useState(false)
  const [restoreCopied, setRestoreCopied] = useState(false)
  const [restoreError, setRestoreError] = useState("")
  const [nickEditId, setNickEditId] = useState<number | null>(null)
  const [nickValue, setNickValue] = useState("")
  const [nickSavingId, setNickSavingId] = useState<number | null>(null)
  const [profileUserId, setProfileUserId] = useState<number | null>(null)

  // Aligné sur getAccount : points = CA livré + ajustement − dépensés
  const totalPoints = (u: AdminUserRow) =>
    Math.max(0, computeLoyaltyPoints(u.totalSpent) + u.loyaltyAdjustment - (u.loyaltySpent ?? 0))

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
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, flags: next } : x)))
    const res = await setUserFlags(u.id, next)
    if (!res.ok) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, flags: u.flags } : x)))
    }
  }

  const toggleDeliveryPreference = async (u: AdminUserRow, preference: "excludeNews" | "excludeNotifications") => {
    const value = !u[preference]
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, [preference]: value } : x)))
    const res = await setUserDeliveryPreferences(u.id, preference, value)
    if (!res.ok) setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, [preference]: !value } : x)))
  }

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.id)
    setEditValue(String(totalPoints(u)))
  }

  const handleSavePoints = async (u: AdminUserRow) => {
    const desired = Number.parseInt(editValue, 10)
    if (!Number.isFinite(desired) || desired < 0) return
    // desired = CA_livré + adjustment − spent  →  adjustment = desired − CA_livré + spent
    const adjustment = desired - computeLoyaltyPoints(u.totalSpent) + (u.loyaltySpent ?? 0)
    setSavingId(u.id)
    try {
      const res = await setLoyaltyAdjustment(u.id, adjustment)
      if (res.ok && "loyaltyAdjustment" in res) {
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, loyaltyAdjustment: res.loyaltyAdjustment } : x)),
        )
        setEditingId(null)
      }
    } finally {
      setSavingId(null)
    }
  }

  const startNickEdit = (u: AdminUserRow) => {
    setNickEditId(u.id)
    setNickValue(u.nickname ?? "")
  }

  const saveNickname = async (u: AdminUserRow) => {
    setNickSavingId(u.id)
    try {
      const res = await setUserNickname(u.id, nickValue)
      if (res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, nickname: res.nickname } : x)))
        setNickEditId(null)
      }
    } finally {
      setNickSavingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.pseudo.toLowerCase().includes(q) ||
        u.token.toLowerCase().includes(q) ||
        (u.nickname ?? "").toLowerCase().includes(q),
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

  const handleRestoreAccess = async (user: AdminUserRow) => {
    setRestoreUser(user)
    setRestoreUrl("")
    setRestoreError("")
    setRestoreCopied(false)
    setRestoreSending(true)
    try {
      const result = await grantRestoreAccess(user.token, window.location.origin)
      if (!result.ok || !result.restoreUrl) {
        setRestoreError(result.error ?? "Impossible de générer le lien.")
        return
      }
      setRestoreUrl(result.restoreUrl)
    } catch {
      setRestoreError("Impossible de générer le lien de récupération.")
    } finally {
      setRestoreSending(false)
    }
  }

  const copyRestoreUrl = async () => {
    if (!restoreUrl) return
    try {
      await navigator.clipboard.writeText(restoreUrl)
      setRestoreCopied(true)
      window.setTimeout(() => setRestoreCopied(false), 2000)
    } catch {
      setRestoreError("Copie impossible. Sélectionne le lien manuellement.")
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

  const [kycValidatingId, setKycValidatingId] = useState<number | null>(null)

  const handleValidateKyc = async (u: AdminUserRow) => {
    if (u.kycStatus === "validated" || kycValidatingId === u.id) return
    const hasPending = u.kycStatus === "pending" && u.kycId != null
    const ok = window.confirm(
      hasPending
        ? `Valider le KYC de ${u.pseudo} ?`
        : `Valider manuellement le KYC de ${u.pseudo} ?\n\nAucune pièce soumise : le compte sera marqué vérifié sans selfie.`,
    )
    if (!ok) return
    setKycValidatingId(u.id)
    try {
      const res = hasPending
        ? await validateAndPurge(u.kycId!)
        : await adminForceValidateKyc(u.token)
      if (res.ok) {
        setUsers((prev) =>
          prev.map((row) =>
            row.id === u.id
              ? {
                  ...row,
                  kycStatus: "validated",
                  kycId: "id" in res && res.id ? res.id : row.kycId,
                }
              : row,
          ),
        )
      } else {
        window.alert(("error" in res && res.error) || "Échec de la validation.")
      }
    } catch {
      window.alert("Erreur réseau.")
    } finally {
      setKycValidatingId(null)
    }
  }

  const actionButtons = (u: AdminUserRow) => (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {u.kycStatus !== "validated" && (
        <button
          type="button"
          onClick={() => void handleValidateKyc(u)}
          disabled={kycValidatingId === u.id}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
            u.kycStatus === "pending"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
          }`}
          title={
            u.kycStatus === "pending"
              ? "Valider la vérification soumise"
              : "Valider KYC manuellement (sans pièce)"
          }
        >
          {kycValidatingId === u.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {u.kycStatus === "pending" ? "Valider KYC" : "Marquer KYC"}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setProfileUserId(u.id)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-xs font-semibold transition-colors hover:bg-secondary"
        title="Fiche client 360°"
      >
        <UserRoundSearch className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">360°</span>
      </button>
      <RowActionsMenu
        user={u}
        restoreBusy={restoreSending && restoreUser?.id === u.id}
        onContact={() => {
          setContactUser(u)
          setContactMsg("")
          setContactDone(false)
        }}
        onRestore={() => handleRestoreAccess(u)}
        onDelete={() => setConfirmUser(u)}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Répertoire des comptes</h2>
            <p className="text-xs text-muted-foreground">
              Recherche, signalements, points — détails dans la fiche 360°.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-center">
          <div className="text-xl font-bold">{users.length}</div>
          <div className="text-[11px] text-muted-foreground">Comptes</div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (pseudo, surnom, token)…"
          className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>

      {/* Mobile : cartes compactes */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Aucun compte à afficher.
          </p>
        ) : (
          filtered.map((u) => (
            <article key={u.id} className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.pseudo}</p>
                  {nickEditId === u.id ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={nickValue}
                        maxLength={60}
                        onChange={(e) => setNickValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) saveNickname(u)
                          if (e.key === "Escape") setNickEditId(null)
                        }}
                        autoFocus
                        className="w-full rounded-lg border border-accent bg-background px-2 py-1 text-xs outline-none"
                        placeholder="Surnom interne…"
                      />
                      <button type="button" onClick={() => saveNickname(u)} className="rounded-md bg-accent p-1 text-accent-foreground">
                        {nickSavingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => setNickEditId(null)} className="rounded-md border border-border p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startNickEdit(u)}
                      className="mt-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      {u.nickname ? u.nickname : <span className="italic opacity-60">+ surnom</span>}
                    </button>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <FlagSelector user={u} onToggle={toggleFlag} compact />
                    <DeliveryPreferences user={u} onChange={toggleDeliveryPreference} />
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ShoppingBag className="h-3 w-3 text-accent" />
                      {u.orderCount}
                    </span>
                    {editingId === u.id ? (
                      <div className="flex items-center gap-1">
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
                          aria-label={`Points de ${u.pseudo}`}
                          className="w-20 rounded-lg border border-accent bg-background px-1.5 py-0.5 text-xs"
                        />
                        <button type="button" onClick={() => handleSavePoints(u)} className="rounded bg-accent p-1 text-accent-foreground" title="Enregistrer">
                          {savingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded border border-border p-1" title="Annuler">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                          <Coins className="h-3 w-3" />
                          {totalPoints(u)} pts
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          title="Modifier les points fidélité"
                          aria-label={`Modifier les points de ${u.pseudo}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {u.mustSetPassword && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                        mdp
                      </span>
                    )}
                    {u.kycStatus === "pending" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        KYC
                      </span>
                    )}
                    {u.kycStatus === "validated" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        OK
                      </span>
                    )}
                  </div>
                </div>
                {actionButtons(u)}
              </div>
            </article>
          ))
        )}
      </div>

      {/* Desktop / tablette : tableau allégé */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-3 py-3 font-medium">Signalement</th>
                <th className="px-3 py-3 font-medium">Envois</th>
                <th className="hidden px-3 py-3 font-medium xl:table-cell">Token</th>
                <th className="px-3 py-3 font-medium">Cmd</th>
                <th className="px-3 py-3 font-medium">KYC</th>
                <th className="px-3 py-3 font-medium">Points</th>
                <th className="sticky right-0 bg-background/95 px-3 py-3 text-right font-medium backdrop-blur">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Aucun compte à afficher.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.pseudo}</p>
                        {nickEditId === u.id ? (
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              type="text"
                              value={nickValue}
                              maxLength={60}
                              onChange={(e) => setNickValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.nativeEvent.isComposing) saveNickname(u)
                                if (e.key === "Escape") setNickEditId(null)
                              }}
                              autoFocus
                              placeholder="Surnom…"
                              className="w-36 rounded-lg border border-accent bg-background px-2 py-1 text-xs outline-none"
                            />
                            <button type="button" onClick={() => saveNickname(u)} className="rounded-md bg-accent p-1 text-accent-foreground">
                              {nickSavingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                            <button type="button" onClick={() => setNickEditId(null)} className="rounded-md border border-border p-1">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startNickEdit(u)}
                            className="group mt-0.5 flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
                            title="Surnom interne"
                          >
                            <span className="truncate">{u.nickname || "—"}</span>
                            <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                          </button>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(u.createdAt)}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <FlagSelector user={u} onToggle={toggleFlag} compact />
                    </td>
                    <td className="px-3 py-3">
                      <DeliveryPreferences user={u} onChange={toggleDeliveryPreference} />
                    </td>
                    <td className="hidden px-3 py-3 xl:table-cell">
                      <button
                        type="button"
                        onClick={() => copyToken(u)}
                        title="Copier le token"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-xs hover:bg-secondary"
                      >
                        {shortToken(u.token)}
                        {copiedId === u.id ? (
                          <Check className="h-3 w-3 text-accent" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                      {u.mustSetPassword && (
                        <span className="mt-1 block text-[10px] font-semibold text-amber-400">mdp à définir</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ShoppingBag className="h-3.5 w-3.5 text-accent" />
                        {u.orderCount}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {u.kycStatus === "pending" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                          Attente
                        </span>
                      ) : u.kycStatus === "validated" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          OK
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-zinc-500">Non vérifié</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-1">
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
                            aria-label={`Points de ${u.pseudo}`}
                            className="w-20 rounded-lg border border-accent bg-background px-2 py-1 text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePoints(u)}
                            className="rounded-md bg-accent p-1 text-accent-foreground"
                            title="Enregistrer"
                          >
                            {savingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-border p-1" title="Annuler">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                            <Coins className="h-3 w-3" />
                            {totalPoints(u)}
                          </span>
                          {u.loyaltyAdjustment !== 0 && (
                            <span className="text-[10px] text-muted-foreground" title="Ajustement manuel">
                              ({u.loyaltyAdjustment > 0 ? "+" : ""}
                              {u.loyaltyAdjustment})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Modifier les points fidélité manuellement"
                            aria-label={`Modifier les points de ${u.pseudo}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="sticky right-0 bg-card/95 px-3 py-3 text-right backdrop-blur group-hover:bg-secondary/40">
                      {actionButtons(u)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {restoreUser && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Récupérer le compte de ${restoreUser.pseudo}`}
        >
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold">Lien de récupération généré</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Envoie ce lien à {restoreUser.pseudo}. Il expire dans 24 h et ne peut être utilisé qu&apos;une fois.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRestoreUser(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {restoreSending ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Génération…
              </div>
            ) : restoreError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {restoreError}
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={restoreUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 py-2.5 font-mono text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyRestoreUrl}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground"
                  >
                    {restoreCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {restoreCopied ? "Copié" : "Copier"}
                  </button>
                </div>
              </>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setRestoreUser(null)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <MessageSquare className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold">Contacter un client</h3>
                  <p className="text-xs text-muted-foreground">
                    Message à <span className="font-semibold text-foreground">{contactUser.pseudo}</span>
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setContactUser(null)} className="rounded-full p-1.5 hover:bg-secondary" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {contactDone ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Check className="h-8 w-8 text-accent" />
                <p className="font-semibold">Message envoyé</p>
              </div>
            ) : (
              <>
                <textarea
                  value={contactMsg}
                  onChange={(e) => setContactMsg(e.target.value)}
                  placeholder={`Message à ${contactUser.pseudo}…`}
                  rows={4}
                  autoFocus
                  className="w-full resize-none rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:border-accent"
                />
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setContactUser(null)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleContact}
                    disabled={contactSending || !contactMsg.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    {contactSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-bold">Supprimer ce compte ?</h3>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Le compte <span className="font-semibold text-foreground">{confirmUser.pseudo}</span> sera
              définitivement supprimé. Les commandes restent dans l&apos;historique.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmUser(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmUser)}
                disabled={pendingId === confirmUser.id}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {pendingId === confirmUser.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {profileUserId != null && (
        <AdminUser360 userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  )
}
