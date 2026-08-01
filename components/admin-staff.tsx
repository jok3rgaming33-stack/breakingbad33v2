"use client"

import { useState } from "react"
import {
  listStaff,
  createWhitelistMember,
  setStaffActive,
  deleteStaffMember,
  setWhitelistPassword,
} from "@/app/actions/staff"
import type { StaffRow } from "@/app/actions/staff"
import {
  UserPlus,
  Loader2,
  Trash2,
  Ban,
  CheckCircle2,
  KeyRound,
  Users,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react"

/**
 * Whitelist membres — accès client uniquement.
 * L'admin définit pseudo + mot de passe libre (pas de règle 30 car. / complexité).
 */
export function AdminStaff({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [pseudo, setPseudo] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [okMsg, setOkMsg] = useState("")
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPw, setResetPw] = useState("")
  const [copiedId, setCopiedId] = useState<number | null>(null)

  async function refresh() {
    const rows = await listStaff()
    setStaff(rows)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setOkMsg("")
    setBusy(true)
    try {
      const res = await createWhitelistMember({
        pseudo: pseudo.trim(),
        password,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOkMsg(`Membre « ${pseudo.trim()} » ajouté. Il peut se connecter avec ce mot de passe.`)
      setPseudo("")
      setPassword("")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(member: StaffRow) {
    await setStaffActive(member.id, !member.active)
    setStaff((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, active: !m.active } : m)),
    )
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce membre de la whitelist ?")) return
    await deleteStaffMember(id)
    setStaff((prev) => prev.filter((m) => m.id !== id))
  }

  async function handleResetPassword(id: number) {
    if (!resetPw.trim()) {
      setError("Indique le nouveau mot de passe.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const res = await setWhitelistPassword(id, resetPw)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOkMsg("Mot de passe mis à jour.")
      setResetId(null)
      setResetPw("")
    } finally {
      setBusy(false)
    }
  }

  function copyHint(member: StaffRow) {
    const text = `Connexion BreakingBad33\nPseudo : ${member.pseudo}\nMot de passe : (celui que tu as défini)`
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(member.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-5 w-5 text-accent" aria-hidden="true" />
          Whitelist membres
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Ajoute un membre avec un <strong>pseudo</strong> et un{" "}
          <strong>mot de passe de ton choix</strong> (pas de minimum 30 caractères, pas de
          règles complexes). Il se connecte comme client —{" "}
          <strong>sans accès admin</strong>.
        </p>
      </div>

      {/* Formulaire création */}
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Ajouter un membre
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Pseudo
            </label>
            <input
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              className="input"
              placeholder="ex. Toto"
              required
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Mot de passe (libre)
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-11"
                placeholder="ex. abc12"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Masquer" : "Afficher"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Aucune contrainte de longueur type clé secrète (30 car.).
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {okMsg && (
          <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
            {okMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Ajouter à la whitelist
        </button>
      </form>

      {/* Liste */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">
            Membres ({staff.length})
          </h3>
        </div>
        {staff.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Aucun membre whitelist pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((member) => (
              <li key={member.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{member.pseudo ?? "—"}</span>
                      {member.active ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                          Actif
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          Suspendu
                        </span>
                      )}
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                        Client (pas admin)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Créé le {new Date(member.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyHint(member)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    >
                      {copiedId === member.id ? (
                        <Check className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copier rappel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetId(resetId === member.id ? null : member.id)
                        setResetPw("")
                        setError("")
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      MDP
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(member)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                    >
                      {member.active ? (
                        <>
                          <Ban className="h-3.5 w-3.5" /> Suspendre
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Activer
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>

                {resetId === member.id && (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-background/50 p-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Nouveau mot de passe
                      </label>
                      <input
                        type="text"
                        value={resetPw}
                        onChange={(e) => setResetPw(e.target.value)}
                        className="input"
                        placeholder="Mot de passe libre"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleResetPassword(member.id)}
                      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
