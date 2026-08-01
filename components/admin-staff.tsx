"use client"

import { useState, useTransition } from "react"
import {
  listStaff,
  createStaffMember,
  setStaffActive,
  deleteStaffMember,
  regenerateStaffInvite,
} from "@/app/actions/staff"
import type { StaffRow } from "@/app/actions/staff"
import {
  Users,
  Plus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Loader2,
  ShieldCheck,
  ShieldOff,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Link as LinkIcon,
} from "lucide-react"

// Toutes les permissions disponibles
const ALL_PERMISSIONS = [
  { id: "messagerie",    label: "Messagerie" },
  { id: "commandes",     label: "Suivi commandes" },
  { id: "produits",      label: "Gestion produits" },
  { id: "utilisateurs",  label: "Gestion utilisateurs" },
  { id: "promos",        label: "Codes promo" },
  { id: "logistique",    label: "Logistique" },
  { id: "notifications", label: "Notifications" },
]

function shortToken(t: string) {
  return `${t.slice(0, 8)}…${t.slice(-4)}`
}

export function AdminStaff({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [isPending, startTransition] = useTransition()

  // ── Formulaire de création ──────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [canAdmin, setCanAdmin] = useState(false)
  const [permissions, setPermissions] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  // ── Feedback copie ─────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<number | "new" | null>(null)
  const [newLink, setNewLink] = useState<string | null>(null)

  // ── Confirmation suppression ───────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // ── Régénération ───────────────────────────────────────────────────
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)

  function togglePermission(id: string) {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  function buildInviteUrl(token: string) {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/staff/${token}`
  }

  function copyToClipboard(text: string, id: number | "new") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2500)
    })
  }

  async function handleCreate() {
    if (creating) return
    setCreateError("")
    setCreating(true)
    try {
      const res = await createStaffMember({ canAdmin, permissions })
      if (!res.ok) {
        setCreateError(res.error)
        return
      }
      const url = buildInviteUrl(res.inviteToken)
      setNewLink(url)
      setShowForm(false)
      setCanAdmin(false)
      setPermissions([])
      // Refresh list
      const rows = await listStaff()
      setStaff(rows)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(member: StaffRow) {
    startTransition(async () => {
      await setStaffActive(member.id, !member.active)
      setStaff((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, active: !m.active } : m)),
      )
    })
  }

  async function handleDelete(id: number) {
    startTransition(async () => {
      await deleteStaffMember(id)
      setStaff((prev) => prev.filter((m) => m.id !== id))
      setConfirmDeleteId(null)
    })
  }

  async function handleRegenerate(id: number) {
    setRegeneratingId(id)
    try {
      const res = await regenerateStaffInvite(id)
      if (!res.ok) return
      const url = buildInviteUrl(res.inviteToken)
      setNewLink(url)
      const rows = await listStaff()
      setStaff(rows)
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Gestion du staff</h2>
          <p className="text-sm text-muted-foreground">
            Invite et gère les membres de ton équipe.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setCreateError(""); setNewLink(null) }}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau membre
        </button>
      </div>

      {/* ── Lien généré après création / régénération ─────────────────── */}
      {newLink && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <div className="mb-2 flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <p className="text-sm font-semibold text-accent">Lien d&apos;invitation généré</p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Partage ce lien au membre concerné. Il est à usage unique.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={newLink}
              className="flex-1 truncate rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(newLink, "new")}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs transition-colors hover:bg-secondary"
            >
              {copiedId === "new"
                ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiedId === "new" ? "Copié" : "Copier"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewLink(null)}
            className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ── Formulaire de création ─────────────────────────────────────── */}
      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 font-semibold">Configurer l&apos;invitation</h3>

          {/* Accès admin */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Accès panel admin</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCanAdmin(false)}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${
                  !canAdmin
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/40"
                }`}
              >
                <ShieldOff className="h-5 w-5" aria-hidden="true" />
                Non — compte client étendu
              </button>
              <button
                type="button"
                onClick={() => setCanAdmin(true)}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-colors ${
                  canAdmin
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/40"
                }`}
              >
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                Oui — accès panel admin
              </button>
            </div>
          </div>

          {/* Permissions */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Permissions accordées
              {canAdmin && (
                <span className="ml-1 text-muted-foreground/60">
                  (informatives si accès admin complet)
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePermission(p.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    permissions.includes(p.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:border-accent/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {createError && (
            <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {createError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm transition-colors hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {creating
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <LinkIcon className="h-4 w-4" aria-hidden="true" />}
              Générer le lien
            </button>
          </div>
        </div>
      )}

      {/* ── Liste du staff ─────────────────────────────────────────────── */}
      {staff.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Aucun membre du staff pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-3">Pseudo</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Invitation</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.map((member) => (
                <tr key={member.id} className="transition-colors hover:bg-secondary/20">
                  {/* Pseudo */}
                  <td className="px-4 py-3 font-medium">
                    {member.pseudo ?? (
                      <span className="italic text-muted-foreground">En attente…</span>
                    )}
                  </td>

                  {/* Rôle */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      member.canAdmin
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}>
                      {member.canAdmin
                        ? <><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Admin</>
                        : <><Users className="h-3 w-3" aria-hidden="true" /> Client étendu</>}
                    </span>
                  </td>

                  {/* Permissions */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {member.permissions.length === 0 ? (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      ) : (
                        member.permissions.map((p) => (
                          <span key={p} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                            {ALL_PERMISSIONS.find((x) => x.id === p)?.label ?? p}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Lien invitation */}
                  <td className="px-4 py-3">
                    {member.inviteUsed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Check className="h-3 w-3" aria-hidden="true" /> Utilisé
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(buildInviteUrl(member.inviteToken), member.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-xs transition-colors hover:bg-secondary"
                          title="Copier le lien d'invitation"
                        >
                          {shortToken(member.inviteToken)}
                          {copiedId === member.id
                            ? <Check className="h-3 w-3 text-accent" aria-hidden="true" />
                            : <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(member)}
                      disabled={isPending}
                      title={member.active ? "Suspendre" : "Réactiver"}
                      className="flex items-center gap-1.5 text-xs transition-colors"
                    >
                      {member.active ? (
                        <>
                          <ToggleRight className="h-5 w-5 text-accent" aria-hidden="true" />
                          <span className="text-accent">Actif</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                          <span className="text-muted-foreground">Suspendu</span>
                        </>
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Régénérer le lien */}
                      {!member.inviteUsed && (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(member.id)}
                          disabled={regeneratingId === member.id}
                          title="Régénérer le lien d'invitation"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-secondary disabled:opacity-50"
                        >
                          {regeneratingId === member.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                        </button>
                      )}
                      {/* Supprimer */}
                      {confirmDeleteId === member.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(member.id)}
                            className="flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:bg-secondary"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(member.id)}
                          title="Supprimer ce membre"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:border-destructive/40 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
