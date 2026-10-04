"use client"

import { useEffect, useState } from "react"
import { Fingerprint, Loader2 } from "lucide-react"
import {
  finishAdminWebAuthnRegistration,
  listAdminWebAuthnCredentials,
  removeAdminWebAuthnCredential,
  startAdminWebAuthnRegistration,
} from "@/app/actions/webauthn"
import { loadWebAuthnBrowser } from "@/lib/webauthn-browser"
import { biometryLabel, browserSupportsWebAuthn, rememberLocalCredential, forgetLocalCredential } from "@/lib/webauthn-client"

export function AdminBiometric({ compact = false }: { compact?: boolean }) {
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
    listAdminWebAuthnCredentials()
      .then((rows) => setCount(rows.length))
      .catch(() => setCount(0))
  }, [])

  if (!supported) return null

  const label = biometryLabel()

  const enroll = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const api = await loadWebAuthnBrowser()
      if (!api) {
        setMsg("Indisponible sur cet appareil.")
        return
      }
      const start = await startAdminWebAuthnRegistration()
      if (!start.ok) {
        setMsg(start.error)
        return
      }
      const attestation = await api.startRegistration({ optionsJSON: start.options })
      const done = await finishAdminWebAuthnRegistration({
        challengeId: start.challengeId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: attestation as any,
        deviceLabel: label,
      })
      if (!done.ok) {
        setMsg(done.error)
        return
      }
      rememberLocalCredential(done.credentialId)
      setCount((n) => n + 1)
      setMsg(`${label} activé pour le panel.`)
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : ""
      if (name === "NotAllowedError") setMsg("Activation annulée.")
      else if (name === "InvalidStateError") setMsg("Déjà enregistré sur cet appareil.")
      else setMsg("Activation impossible. Le token reste valable.")
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const rows = await listAdminWebAuthnCredentials()
      for (const row of rows) {
        const res = await removeAdminWebAuthnCredential(row.id)
        if (res.ok) forgetLocalCredential(row.id)
      }
      setCount(0)
      setMsg("Biométrie admin retirée de cet appareil.")
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void (count > 0 ? disable() : enroll())}
        disabled={busy}
        title={count > 0 ? `${label} actif — cliquer pour retirer` : `Activer ${label}`}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-input bg-secondary text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Connexion biométrique
      </p>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
        {count > 0
          ? `${label} est actif sur cet appareil. La prochaine ouverture du panel peut s'en servir.`
          : `Active ${label} pour ouvrir le panel sans recoller le token.`}
      </p>
      <button
        type="button"
        onClick={() => void enroll()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-input bg-secondary px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
        {busy ? "Patiente…" : count > 0 ? "Ajouter cet appareil" : `Activer ${label}`}
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => void disable()}
          disabled={busy}
          className="mt-2 w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Retirer la biométrie admin
        </button>
      )}
      {msg && <p className="mt-2 text-[11px] text-accent">{msg}</p>}
    </div>
  )
}
