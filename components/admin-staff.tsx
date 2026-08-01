"use client"

import { useState } from "react"
import {
  listStaff,
  createWhitelistMember,
  setStaffActive,
  deleteStaffMember,
  regenerateWhitelistToken,
} from "@/app/actions/staff"
import type { StaffRow } from "@/app/actions/staff"
import {
  UserPlus,
  Loader2,
  Trash2,
  Ban,
  CheckCircle2,
  Users,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
} from "lucide-react"

/**
 * Whitelist : l'admin saisit le pseudo, le serveur génère une clé secrète
 * (≥ 30 car., format accès client) à coller sur l'écran de connexion classique.
 */
export function AdminStaff({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [pseudo, setPseudo] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [okMsg, setOkMsg] = useState("")
  /** Dernière clé générée (création ou régénération) — affichée pour copie */
  const [lastIssued, setLastIssued] = useState<{
    pseudo: string
    token: string
  } | null>(null)
  const [copied, setCopied] = useState<"token" | "full" | number | null>(null)

  async function refresh() {
    const rows = await listStaff()
    setStaff(rows)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setOkMsg("")
    setLastIssued(null)
    setBusy(true)
    try {
      const res = await createWhitelistMember({ pseudo: pseudo.trim() })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setLastIssued({ pseudo: res.pseudo, token: res.customerToken })
      setOkMsg(
        `Membre « ${res.pseudo} » créé. Copie la clé secrète ci-dessous et envoie-la au membre.`,
      )
      setPseudo("")
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
    if (lastIssued) setLastIssued(null)
  }

  async function handleRegenerate(member: StaffRow) {
    if (
      !confirm(
        `Régénérer la clé de « ${member.pseudo} » ? L'ancienne clé ne fonctionnera plus.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError("")
    try {
      const res = await regenerateWhitelistToken(member.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setLastIssued({
        pseudo: member.pseudo ?? "membre",
        token: res.customerToken,
      })
      setOkMsg(`Nouvelle clé générée pour « ${member.pseudo} ».`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  function copyText(text: string, id: "token" | "full" | number) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
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
          Tu saisis le <strong>pseudo</strong>. Le système génère une{" "}
          <strong>clé secrète</strong> (token ≥ 30 caractères, même format que les clients
          anonymes). Le membre se connecte avec cette clé sur « J&apos;ai déjà une clé » —{" "}
          <strong>sans accès admin</strong>.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Ajouter un membre
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
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
          <button
            type="submit"
            disabled={busy || !pseudo.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Créer + générer la clé
          </button>
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
      </form>

      {/* Clé fraîchement émise — à copier tout de suite */}
      {lastIssued && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
            <KeyRound className="h-4 w-4" />
            Clé secrète pour « {lastIssued.pseudo} »
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Envoie cette clé au membre. Il la colle dans « J&apos;ai déjà une clé » sur
            l&apos;accueil ({lastIssued.token.length} caractères).
          </p>
          <code className="mb-3 block break-all rounded-xl border border-border bg-background/80 px-3 py-3 font-mono text-xs sm:text-sm">
            {lastIssued.token}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText(lastIssued.token, "token")}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
            >
              {copied === "token" ? (
                <Check className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copier la clé
            </button>
            <button
              type="button"
              onClick={() =>
                copyText(
                  `BreakingBad33 — accès membre\nPseudo : ${lastIssued.pseudo}\nClé secrète : ${lastIssued.token}\n\nConnexion : page d'accueil → « J'ai déjà une clé »`,
                  "full",
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
            >
              {copied === "full" ? (
                <Check className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copier message complet
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Membres ({staff.length})</h3>
        </div>
        {staff.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Aucun membre whitelist pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((member) => (
              <li key={member.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
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
                        Client
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Créé le {new Date(member.createdAt).toLocaleString("fr-FR")}
                    </p>
                    {member.customerToken && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full truncate rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-[11px]">
                          {member.customerToken.length > 24
                            ? `${member.customerToken.slice(0, 12)}…${member.customerToken.slice(-8)}`
                            : member.customerToken}
                          <span className="ml-1 text-muted-foreground">
                            ({member.customerToken.length} car.)
                          </span>
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(member.customerToken!, member.id)
                          }
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-secondary"
                        >
                          {copied === member.id ? (
                            <Check className="h-3 w-3 text-accent" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copier clé
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRegenerate(member)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Régénérer clé
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
