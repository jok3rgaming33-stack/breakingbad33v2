"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, Wallet, ExternalLink, CheckCircle2, AlertTriangle, CreditCard } from "lucide-react"
import {
  getCryptoGatewayStatus,
  setCryptoGatewayEnabled,
  type CryptoGatewayPublicStatus,
} from "@/app/actions/crypto-payment"
import {
  getPaysafecardConfig,
  setPaysafecardConfig,
  type PaysafecardConfig,
} from "@/app/actions/settings"
import { PAYSAFECARD_OFFICIAL } from "@/lib/paysafecard"

/** Réglages paiement Monero (NOWPayments) + Paysafecard (Locker). */
export function AdminCryptoSettings() {
  const [status, setStatus] = useState<CryptoGatewayPublicStatus | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [psc, setPsc] = useState<PaysafecardConfig>({ instructions: "" })
  const [pscSaving, setPscSaving] = useState(false)
  const [pscMsg, setPscMsg] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getCryptoGatewayStatus(), getPaysafecardConfig()])
      .then(([s, p]) => {
        setStatus(s)
        setEnabled(s.enabled)
        setPsc(p)
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    const res = await setCryptoGatewayEnabled(enabled)
    setSaving(false)
    if (!res.ok) {
      setMsg(res.error ?? "Erreur")
      return
    }
    const s = await getCryptoGatewayStatus()
    setStatus(s)
    setMsg("Enregistré.")
  }

  const savePsc = async () => {
    setPscSaving(true)
    setPscMsg(null)
    const res = await setPaysafecardConfig(psc)
    setPscSaving(false)
    if (!res.ok) {
      setPscMsg(res.error ?? "Erreur")
      return
    }
    if (res.config) setPsc(res.config)
    setPscMsg("Paysafecard enregistré.")
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold">Paiement Monero (XMR)</h3>
            <p className="text-sm text-muted-foreground">
              Gateway NOWPayments — <strong>XMR uniquement</strong>. Les clés API se configurent sur Vercel.
            </p>
          </div>
        </div>

        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            status?.enabled
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {status?.enabled ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{status?.message ?? "Statut inconnu."}</span>
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Variables d&apos;environnement Vercel</p>
          <ul className="list-inside list-disc space-y-1 font-mono">
            <li>NOWPAYMENTS_API_KEY (obligatoire)</li>
            <li>NOWPAYMENTS_IPN_SECRET ou NOWPAYMENTS_PUBLIC_KEY (optionnel)</li>
            <li>NEXT_PUBLIC_SITE_URL (URL prod BreakingBad33)</li>
          </ul>
          <p>
            IPN callback dans NOWPayments (Settings → Store / IPN) :{" "}
            <code className="rounded bg-black/30 px-1">https://www.breakingbad33.com/api/crypto/ipn</code>
          </p>
          <p className="text-accent">pay_currency forcé = xmr (Monero uniquement)</p>
          <a
            href="https://nowpayments.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            Ouvrir NOWPayments <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!status?.configured}
            className="h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-semibold">Activer le paiement XMR au checkout</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Si désactivé (ou sans clés), le site fonctionne comme avant.
            </span>
          </span>
        </label>

        {msg && <p className="mb-3 text-sm text-accent">{msg}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving || !status?.configured}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
      </div>

      {/* Paysafecard — Locker uniquement */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold">Paysafecard (Locker uniquement)</h3>
            <p className="text-sm text-muted-foreground">
              Code prépayé 16 chiffres. Process : client achète sur le site officiel → envoie le PIN → tu confirmes →
              token TRK_ en messagerie.
            </p>
          </div>
        </div>

        <div className="mb-4 space-y-2 rounded-xl border border-border bg-background/50 p-3 text-xs">
          <p className="font-semibold text-foreground">Liens officiels (envoyés au client)</p>
          <a
            href={PAYSAFECARD_OFFICIAL.home}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline"
          >
            {PAYSAFECARD_OFFICIAL.home} <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PAYSAFECARD_OFFICIAL.buyOnline}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-accent hover:underline"
          >
            Acheter en ligne <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PAYSAFECARD_OFFICIAL.findStore}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-accent hover:underline"
          >
            Points de vente <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Instructions client (optionnel)
        </label>
        <textarea
          value={psc.instructions}
          onChange={(e) => setPsc((p) => ({ ...p, instructions: e.target.value }))}
          rows={3}
          placeholder="Achète un ticket du montant exact sur le site officiel, envoie le PIN à 16 chiffres…"
          className="mb-3 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />

        {pscMsg && <p className="mb-3 text-sm text-accent">{pscMsg}</p>}

        <button
          type="button"
          onClick={savePsc}
          disabled={pscSaving}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pscSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer Paysafecard
        </button>
      </div>
    </div>
  )
}
