"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  listAdmins,
  createAdmin,
  setAdminActive,
  setAdminPassword,
  regenerateAdminToken,
  deleteAdmin,
  type AdminRow,
} from "@/app/actions/admins"
import { UserPlus, Copy, Check, KeyRound, RefreshCw, Trash2, ShieldOff, ShieldCheck, Loader2, AlertTriangle } from "lucide-react"

export function AdminAdmins() {
  const { data: admins, mutate, isLoading } = useSWR("admin-admins", () => listAdmins())
  const [pseudo, setPseudo] = useState("")
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleCreate = async () => {
    if (creating) return
    setError(null)
    setCreating(true)
    const res = await createAdmin({ pseudo, password: usePassword ? password : null })
    setCreating(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur.")
      return
    }
    setPseudo("")
    setPassword("")
    setUsePassword(false)
    mutate()
  }

  const toggleActive = async (a: AdminRow) => {
    await setAdminActive(a.id, !a.active)
    mutate()
  }

  const handlePassword = async (a: AdminRow) => {
    const pwd = window.prompt(
      a.hasPassword ? "Nouveau mot de passe (laisser vide pour retirer) :" : "Définir un mot de passe :",
    )
    if (pwd === null) return
    await setAdminPassword(a.id, pwd.trim() || null)
    mutate()
  }

  const handleRegen = async (a: AdminRow) => {
    if (!window.confirm(`Régénérer le token de ${a.pseudo} ? L'ancien token cessera de fonctionner.`)) return
    await regenerateAdminToken(a.id)
    mutate()
  }

  const handleDelete = async (a: AdminRow) => {
    if (!window.confirm(`Supprimer définitivement l'admin ${a.pseudo} ?`)) return
    await deleteAdmin(a.id)
    mutate()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Création */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <UserPlus className="h-5 w-5 text-accent" aria-hidden="true" />
          Ajouter un administrateur
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Un token unique est généré pour chaque admin. Tu peux aussi définir un mot de passe.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Pseudo</span>
            <input
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
              placeholder="Ex. Gus"
            />
          </label>
          <div className="block">
            <span className="mb-1.5 block text-sm font-medium">Mot de passe (optionnel)</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
              Définir un mot de passe choisi
            </label>
            {usePassword && (
              <>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                  placeholder="Mot de passe"
                />
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  Déconseillé pour une protection maximale.
                </p>
              </>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={creating || !pseudo.trim()}
          className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          Créer l&apos;admin
        </button>
      </div>

      {/* Liste */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Administrateurs</div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : !admins || admins.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Aucun admin supplémentaire. Le super-admin (token principal) reste actif.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {admins.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {a.pseudo}
                      {!a.active && (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          Révoqué
                        </span>
                      )}
                      {a.hasPassword && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                          Mot de passe
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="truncate rounded bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {a.token.slice(0, 16)}…
                      </code>
                      <button
                        onClick={() => copy(a.token, `tok-${a.id}`)}
                        className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] transition-colors hover:bg-secondary"
                      >
                        {copied === `tok-${a.id}` ? (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                        Token
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleActive(a)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    {a.active ? (
                      <>
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" /> Révoquer
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Réactiver
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handlePassword(a)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.hasPassword ? "Changer mdp" : "Définir mdp"}
                  </button>
                  <button
                    onClick={() => handleRegen(a)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Régénérer token
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
