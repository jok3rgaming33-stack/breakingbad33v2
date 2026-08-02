"use client"

import { useEffect, useState } from "react"
import { X, LogOut, Loader2, Fingerprint, ScanFace, Trash2 } from "lucide-react"
import { getCustomerStats } from "@/app/actions/account"
import {
  startWebAuthnRegistration,
  finishWebAuthnRegistration,
  listWebAuthnCredentials,
  removeWebAuthnCredential,
  removeAllWebAuthnCredentials,
} from "@/app/actions/webauthn"
import { loadWebAuthnBrowser } from "@/lib/webauthn-browser"
import {
  biometryLabel,
  clearLocalWebAuthn,
  forgetLocalCredential,
  hasLocalWebAuthn,
  platformAuthenticatorAvailable,
  rememberLocalCredential,
} from "@/lib/webauthn-client"

type UserData = { pseudo?: string; token?: string } | null

type UserDashboardModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
  onLogout: () => void
}

export function UserDashboardModal({ isOpen, onClose, userData, onLogout }: UserDashboardModalProps) {
  const token = userData?.token ?? ""
  const [stats, setStats] = useState<{ points: number; active: number; past: number } | null>(null)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioLocal, setBioLocal] = useState(false)
  const [bioList, setBioList] = useState<{ id: string; deviceLabel: string | null; createdAt: string }[]>([])
  const [bioBusy, setBioBusy] = useState(false)
  const [bioMsg, setBioMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !token) return
    setStats(null)
    getCustomerStats(token)
      .then((s) => setStats(s))
      .catch(() => setStats({ points: 0, active: 0, past: 0 }))
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen) return
    setBioMsg(null)
    setBioLocal(hasLocalWebAuthn())
    ;(async () => {
      try {
        const api = await loadWebAuthnBrowser()
        if (!api?.browserSupportsWebAuthn()) {
          setBioAvailable(false)
          return
        }
        setBioAvailable(await platformAuthenticatorAvailable())
      } catch {
        setBioAvailable(false)
      }
    })()
    if (token) {
      listWebAuthnCredentials(token)
        .then(setBioList)
        .catch(() => setBioList([]))
    }
  }, [isOpen, token])

  if (!isOpen) return null

  const spinner = <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" />
  const label = biometryLabel()

  const enroll = async () => {
    if (!token || bioBusy) return
    setBioBusy(true)
    setBioMsg(null)
    try {
      const api = await loadWebAuthnBrowser()
      if (!api) {
        setBioMsg("Biométrie indisponible ici. Ta clé reste valable.")
        setBioAvailable(false)
        return
      }
      const start = await startWebAuthnRegistration(token)
      if (!start.ok) {
        setBioMsg(start.error)
        return
      }
      const attestation = await api.startRegistration({ optionsJSON: start.options })
      const done = await finishWebAuthnRegistration({
        userToken: token,
        challengeId: start.challengeId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: attestation as any,
        deviceLabel: label,
      })
      if (!done.ok) {
        setBioMsg(done.error)
        return
      }
      rememberLocalCredential(done.credentialId)
      setBioLocal(true)
      setBioMsg(`${label} activé. Ta clé reste le secours principal.`)
      const list = await listWebAuthnCredentials(token)
      setBioList(list)
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : ""
      if (name === "NotAllowedError") setBioMsg("Activation annulée — aucun impact.")
      else if (name === "InvalidStateError") {
        setBioMsg("Déjà enregistré sur cet appareil.")
        setBioLocal(true)
      } else setBioMsg("Activation impossible. Continue normalement avec ta clé.")
    } finally {
      setBioBusy(false)
    }
  }

  const removeOne = async (credentialId: string) => {
    if (!token || bioBusy) return
    setBioBusy(true)
    setBioMsg(null)
    try {
      const res = await removeWebAuthnCredential(token, credentialId)
      if (!res.ok) {
        setBioMsg(res.error)
        return
      }
      forgetLocalCredential(credentialId)
      setBioLocal(hasLocalWebAuthn())
      setBioList((prev) => prev.filter((c) => c.id !== credentialId))
      setBioMsg("Déverrouillage retiré.")
    } finally {
      setBioBusy(false)
    }
  }

  const removeAll = async () => {
    if (!token || bioBusy) return
    setBioBusy(true)
    setBioMsg(null)
    try {
      const res = await removeAllWebAuthnCredentials(token)
      if (!res.ok) {
        setBioMsg(res.error)
        return
      }
      clearLocalWebAuthn()
      setBioLocal(false)
      setBioList([])
      setBioMsg("Toute la biométrie a été désactivée pour ce compte.")
    } finally {
      setBioBusy(false)
    }
  }

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
            <div className="text-2xl font-bold text-accent">{stats ? stats.points : spinner}</div>
            <div className="mt-1 text-xs text-muted-foreground">Points</div>
          </div>
          <div className="rounded-2xl bg-background/40 p-4">
            <div className="text-2xl font-bold text-primary">{stats ? stats.active : spinner}</div>
            <div className="mt-1 text-xs text-muted-foreground">En cours</div>
          </div>
          <div className="rounded-2xl bg-background/40 p-4">
            <div className="text-2xl font-bold text-muted-foreground">{stats ? stats.past : spinner}</div>
            <div className="mt-1 text-xs text-muted-foreground">Passées</div>
          </div>
        </div>

        {/* Déverrouillage biométrique */}
        {bioAvailable && (
          <div className="mb-6 rounded-2xl border border-border bg-background/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-accent" aria-hidden="true" />
              <p className="text-sm font-semibold">Déverrouillage rapide</p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              {bioLocal || bioList.length > 0
                ? `${label} permet de te reconnecter sans retaper ta clé sur cet appareil.`
                : `Active ${label} pour te reconnecter plus vite après fermeture du navigateur. Ta clé reste le secours.`}
            </p>

            {bioList.length > 0 && (
              <ul className="mb-3 space-y-2">
                {bioList.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs"
                  >
                    <span className="truncate text-muted-foreground">
                      {c.deviceLabel || "Appareil"} · {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeOne(c.id)}
                      disabled={bioBusy}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive disabled:opacity-40"
                      aria-label="Retirer cet appareil"
                      title="Retirer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void enroll()}
                disabled={bioBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {bioBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ScanFace className="h-4 w-4" aria-hidden="true" />
                )}
                {bioList.length > 0 ? `Ajouter ${label}` : `Activer ${label}`}
              </button>
              {bioList.length > 0 && (
                <button
                  type="button"
                  onClick={() => void removeAll()}
                  disabled={bioBusy}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
                >
                  Tout désactiver
                </button>
              )}
            </div>
            {bioMsg && <p className="mt-2 text-xs text-accent">{bioMsg}</p>}
          </div>
        )}

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
