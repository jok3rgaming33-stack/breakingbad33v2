"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, Check, Clock, Trash2, CalendarClock, Users } from "lucide-react"
import {
  getCartConfig,
  setCartConfig,
  type CartConfig,
  type DeliverySlot,
  type MeetupSlot,
} from "@/app/actions/settings"

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

// Créneaux 2h pour la livraison : 00h-02h, 02h-04h … 22h-00h
const DELIVERY_SLOTS_OPTIONS: { label: string; startHour: number; endHour: number }[] = Array.from(
  { length: 12 },
  (_, i) => {
    const start = i * 2
    const end = (start + 2) % 24
    return {
      label: `${String(start).padStart(2, "0")}h - ${String(end === 0 ? 24 : end).padStart(2, "0")}h`,
      startHour: start,
      endHour: end === 0 ? 24 : end,
    }
  },
)

// Heures individuelles pour meetup : 00h … 23h
const MEETUP_HOURS: number[] = Array.from({ length: 24 }, (_, i) => i)

// ─── Tag individuel ────────────────────────────────────────────────────────
function SlotTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1 font-mono text-sm text-accent">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Supprimer ${label}`}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  )
}

// ─── Sélecteur de créneaux livraison (jour + plage 2h) ────────────────────
function DeliverySlotPicker({
  slots,
  onAdd,
  onRemove,
}: {
  slots: DeliverySlot[]
  onAdd: (slot: DeliverySlot) => void
  onRemove: (id: string) => void
}) {
  const [day, setDay] = useState(DAYS[0])
  const [range, setRange] = useState(0) // index dans DELIVERY_SLOTS_OPTIONS

  const handleAdd = () => {
    const opt = DELIVERY_SLOTS_OPTIONS[range]
    const label = `${day} ${opt.label}`
    // Evite les doublons
    if (slots.some((s) => s.label === label)) return
    onAdd({
      id: `d-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      startHour: opt.startHour,
      endHour: opt.endHour,
      days: [day],
    })
  }

  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-semibold text-accent">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Créneaux de livraison
      </legend>
      <p className="text-xs text-muted-foreground">
        Sélectionne un jour et une plage de 2h puis clique sur &quot;Ajouter&quot;.
      </p>

      {/* Tags existants */}
      <div className="flex min-h-[2.5rem] flex-wrap gap-2 rounded-xl border border-border bg-background/40 p-3">
        {slots.length === 0 && (
          <span className="text-xs italic text-muted-foreground">Aucun créneau — ajoutes-en ci-dessous.</span>
        )}
        {slots.map((s) => (
          <SlotTag key={s.id} label={s.label} onRemove={() => onRemove(s.id)} />
        ))}
      </div>

      {/* Sélecteurs */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          {DELIVERY_SLOTS_OPTIONS.map((opt, i) => (
            <option key={i} value={i}>{opt.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleAdd}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-80"
        >
          + Ajouter
        </button>
      </div>
    </fieldset>
  )
}

// ─── Sélecteur de créneaux meetup (jour + heure exacte) ───────────────────
function MeetupSlotPicker({
  slots,
  onAdd,
  onRemove,
}: {
  slots: MeetupSlot[]
  onAdd: (slot: MeetupSlot) => void
  onRemove: (id: string) => void
}) {
  const [day, setDay] = useState(DAYS[0])
  const [hour, setHour] = useState(0)

  const handleAdd = () => {
    const label = `${day} ${String(hour).padStart(2, "0")}h`
    if (slots.some((s) => s.label === label)) return
    onAdd({
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      hour,
      days: [day],
    })
  }

  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-semibold text-accent">
        <Users className="h-4 w-4" aria-hidden="true" />
        Créneaux meet-up
      </legend>
      <p className="text-xs text-muted-foreground">
        Sélectionne un jour et une heure exacte (heure par heure) puis clique sur &quot;Ajouter&quot;.
      </p>

      {/* Tags existants */}
      <div className="flex min-h-[2.5rem] flex-wrap gap-2 rounded-xl border border-border bg-background/40 p-3">
        {slots.length === 0 && (
          <span className="text-xs italic text-muted-foreground">Aucun créneau — ajoutes-en ci-dessous.</span>
        )}
        {slots.map((s) => (
          <SlotTag key={s.id} label={s.label} onRemove={() => onRemove(s.id)} />
        ))}
      </div>

      {/* Sélecteurs */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          {MEETUP_HOURS.map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleAdd}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-80"
        >
          + Ajouter
        </button>
      </div>
    </fieldset>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────
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
    if (!res.ok) { setError(res.error ?? "Erreur."); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    getCartConfig().then(setForm).catch(() => {})
  }

  if (!form) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      </div>
    )
  }

  const addDelivery = (slot: DeliverySlot) =>
    setForm({ ...form, deliverySlots: [...form.deliverySlots, slot] })
  const removeDelivery = (id: string) =>
    setForm({ ...form, deliverySlots: form.deliverySlots.filter((s) => s.id !== id) })

  const addMeetup = (slot: MeetupSlot) =>
    setForm({ ...form, meetupSlots: [...form.meetupSlots, slot] })
  const removeMeetup = (id: string) =>
    setForm({ ...form, meetupSlots: form.meetupSlots.filter((s) => s.id !== id) })

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Créneaux &amp; conditions du panier</h2>
          <p className="text-sm text-muted-foreground">
            Définis les créneaux par jour proposés aux clients pour la livraison et le meet-up.
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

        {/* Créneaux livraison */}
        <div className="border-t border-border pt-5">
          <DeliverySlotPicker
            slots={form.deliverySlots}
            onAdd={addDelivery}
            onRemove={removeDelivery}
          />
        </div>

        {/* Créneaux meet-up */}
        <div className="border-t border-border pt-5">
          <MeetupSlotPicker
            slots={form.meetupSlots}
            onAdd={addMeetup}
            onRemove={removeMeetup}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
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
