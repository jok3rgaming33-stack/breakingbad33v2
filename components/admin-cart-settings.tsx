"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, Check, Clock, Plus, Trash2, CalendarClock } from "lucide-react"
import {
  getCartConfig,
  setCartConfig,
  type CartConfig,
  type DeliverySlot,
  type MeetupSlot,
} from "@/app/actions/settings"

// Éditeur des créneaux du panier (livraison + meet-up) et du montant minimum de livraison.
export function AdminCartSettings() {
  const [form, setForm] = useState<CartConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCartConfig()
      .then(setForm)
      .catch(() => setError("Impossible de charger les créneaux."))
  }, [])

  const save = async () => {
    if (!form) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const res = await setCartConfig(form)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur lors de l'enregistrement.")
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // Recharge la version normalisée renvoyée par le serveur.
    getCartConfig().then(setForm).catch(() => {})
  }

  if (!form) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      </div>
    )
  }

  const addDelivery = () => {
    const slot: DeliverySlot = { id: `d-${Date.now()}`, label: "Nouveau créneau", startHour: 14, endHour: 17 }
    setForm({ ...form, deliverySlots: [...form.deliverySlots, slot] })
  }
  const updateDelivery = (id: string, patch: Partial<DeliverySlot>) => {
    setForm({
      ...form,
      deliverySlots: form.deliverySlots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }
  const removeDelivery = (id: string) => {
    setForm({ ...form, deliverySlots: form.deliverySlots.filter((s) => s.id !== id) })
  }

  const addMeetup = () => {
    const slot: MeetupSlot = { id: `m-${Date.now()}`, label: "18H", hour: 18 }
    setForm({ ...form, meetupSlots: [...form.meetupSlots, slot] })
  }
  const updateMeetup = (id: string, patch: Partial<MeetupSlot>) => {
    setForm({
      ...form,
      meetupSlots: form.meetupSlots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }
  const removeMeetup = (id: string) => {
    setForm({ ...form, meetupSlots: form.meetupSlots.filter((s) => s.id !== id) })
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Créneaux &amp; conditions du panier</h2>
          <p className="text-sm text-muted-foreground">
            Gère les créneaux proposés aux clients et le montant minimum pour la livraison.
          </p>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-5">
        {/* Montant minimum livraison */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-accent">Montant minimum pour la livraison</legend>
          <p className="text-xs text-muted-foreground">
            En dessous de ce montant, seule l&apos;option meet-up est proposée.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={form.minDeliveryAmount}
              onChange={(e) => setForm({ ...form, minDeliveryAmount: Number(e.target.value) })}
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="text-sm text-muted-foreground">€ d&apos;achat</span>
          </div>
        </fieldset>

        {/* Créneaux de livraison */}
        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Clock className="h-4 w-4" aria-hidden="true" /> Créneaux de livraison
          </legend>
          <p className="text-xs text-muted-foreground">
            Le libellé est affiché au client. Les heures de début/fin servent à masquer les créneaux déjà passés pour
            une commande du jour. (fin ≤ début = créneau qui passe minuit)
          </p>
          <div className="space-y-2">
            {form.deliverySlots.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 p-2.5">
                <input
                  value={s.label}
                  onChange={(e) => updateDelivery(s.id, { label: e.target.value })}
                  placeholder="Libellé (ex. 14H - 17H)"
                  className="min-w-[8rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  début
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={s.startHour}
                    onChange={(e) => updateDelivery(s.id, { startHour: Number(e.target.value) })}
                    className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  fin
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={s.endHour}
                    onChange={(e) => updateDelivery(s.id, { endHour: Number(e.target.value) })}
                    className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeDelivery(s.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Supprimer ce créneau"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addDelivery}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter un créneau de livraison
          </button>
        </fieldset>

        {/* Créneaux meet-up */}
        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Clock className="h-4 w-4" aria-hidden="true" /> Heures de meet-up
          </legend>
          <p className="text-xs text-muted-foreground">
            Heure de retrait unique. Les heures déjà passées sont masquées pour une commande du jour.
          </p>
          <div className="space-y-2">
            {form.meetupSlots.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 p-2.5">
                <input
                  value={s.label}
                  onChange={(e) => updateMeetup(s.id, { label: e.target.value })}
                  placeholder="Libellé (ex. 18H)"
                  className="min-w-[8rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  heure
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={s.hour}
                    onChange={(e) => updateMeetup(s.id, { hour: Number(e.target.value) })}
                    className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeMeetup(s.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Supprimer cette heure"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMeetup}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une heure de meet-up
          </button>
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
          {saved ? "Enregistré" : saving ? "Enregistrement…" : "Enregistrer les créneaux"}
        </button>
      </div>
    </div>
  )
}
