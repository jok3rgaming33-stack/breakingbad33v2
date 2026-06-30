"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, Check, Truck } from "lucide-react"
import { getLogisticsContent, setLogisticsContent, type LogisticsContent } from "@/app/actions/settings"

// Éditeur du contenu de la modale « Livraison & Meet-up » côté client.
export function AdminLogistics() {
  const [form, setForm] = useState<LogisticsContent | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLogisticsContent()
      .then(setForm)
      .catch(() => setError("Impossible de charger le contenu."))
  }, [])

  const save = async () => {
    if (!form) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const res = await setLogisticsContent(form)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur lors de l'enregistrement.")
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!form) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Truck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Modale Livraison &amp; Meet-up</h2>
          <p className="text-sm text-muted-foreground">
            Personnalise les titres et descriptions affichés aux clients.
          </p>
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-accent">Livraison à domicile</legend>
          <LabeledInput
            label="Titre"
            value={form.deliveryTitle}
            onChange={(v) => setForm({ ...form, deliveryTitle: v })}
          />
          <LabeledTextarea
            label="Description"
            value={form.deliveryBody}
            onChange={(v) => setForm({ ...form, deliveryBody: v })}
          />
        </fieldset>

        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="text-sm font-semibold text-accent">Meet-up (retrait)</legend>
          <LabeledInput
            label="Titre"
            value={form.meetupTitle}
            onChange={(v) => setForm({ ...form, meetupTitle: v })}
          />
          <LabeledTextarea
            label="Description"
            value={form.meetupBody}
            onChange={(v) => setForm({ ...form, meetupBody: v })}
          />
        </fieldset>

        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="text-sm font-semibold text-accent">Note finale</legend>
          <LabeledTextarea
            label="Texte affiché en bas de la modale"
            value={form.note ?? ""}
            onChange={(v) => setForm({ ...form, note: v })}
          />
        </fieldset>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saved ? "Enregistré" : saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  )
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  )
}
