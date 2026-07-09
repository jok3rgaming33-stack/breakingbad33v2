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
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// Créneaux 2h pour la livraison
const DELIVERY_RANGES: { label: string; startHour: number; endHour: number }[] = Array.from(
  { length: 12 },
  (_, i) => {
    const start = i * 2
    const end = start + 2 === 24 ? 0 : start + 2
    const endDisplay = end === 0 ? 24 : end
    return {
      label: `${String(start).padStart(2, "0")}h-${String(endDisplay).padStart(2, "0")}h`,
      startHour: start,
      endHour: endDisplay,
    }
  },
)

// Heures individuelles pour meetup
const MEETUP_HOURS = Array.from({ length: 24 }, (_, i) => i)

// ─── Tag individuel ────────────────────────────────────────────────────────
function SlotTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Supprimer ${label}`}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  )
}

// ─── Case à cocher stylée ──────────────────────────────────────────────────
function ToggleChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  )
}

// ─── Sélecteur livraison ────────────────────────────────────────────────────
function DeliverySlotPicker({
  slots,
  onAdd,
  onRemove,
}: {
  slots: DeliverySlot[]
  onAdd: (slots: DeliverySlot[]) => void
  onRemove: (id: string) => void
}) {
  const [selDays, setSelDays] = useState<string[]>([])
  const [selRanges, setSelRanges] = useState<number[]>([])

  const toggleDay = (d: string) =>
    setSelDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const toggleRange = (i: number) =>
    setSelRanges((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  const allDays = selDays.length === DAYS.length
  const allRanges = selRanges.length === DELIVERY_RANGES.length

  const handleAdd = () => {
    if (!selDays.length || !selRanges.length) return
    const toAdd: DeliverySlot[] = []
    for (const day of selDays) {
      for (const ri of selRanges) {
        const opt = DELIVERY_RANGES[ri]
        const label = `${day} ${opt.label}`
        if (!slots.some((s) => s.label === label)) {
          toAdd.push({
            id: `d-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            label,
            startHour: opt.startHour,
            endHour: opt.endHour,
            days: [day],
          })
        }
      }
    }
    if (toAdd.length) { onAdd(toAdd); setSelDays([]); setSelRanges([]) }
  }

  return (
    <fieldset className="space-y-4">
      <legend className="flex items-center gap-2 text-sm font-bold text-accent">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Créneaux de livraison
        <span className="text-xs font-normal text-muted-foreground">(plages de 2h)</span>
      </legend>

      {/* Tags existants */}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-background/40 p-3">
          {slots.map((s) => (
            <SlotTag key={s.id} label={s.label} onRemove={() => onRemove(s.id)} />
          ))}
        </div>
      )}

      {/* Sélection jours */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jours</span>
          <button
            type="button"
            onClick={() => setSelDays(allDays ? [] : [...DAYS])}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {allDays ? "Désélectionner tout" : "Sélectionner tout"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <ToggleChip key={d} label={DAYS_SHORT[i]} selected={selDays.includes(d)} onClick={() => toggleDay(d)} />
          ))}
        </div>
      </div>

      {/* Sélection plages */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plages horaires</span>
          <button
            type="button"
            onClick={() => setSelRanges(allRanges ? [] : DELIVERY_RANGES.map((_, i) => i))}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {allRanges ? "Désélectionner tout" : "Sélectionner tout"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERY_RANGES.map((opt, i) => (
            <ToggleChip key={i} label={opt.label} selected={selRanges.includes(i)} onClick={() => toggleRange(i)} />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!selDays.length || !selRanges.length}
        className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Ajouter {selDays.length > 0 && selRanges.length > 0
          ? `(${selDays.length} jour${selDays.length > 1 ? "s" : ""} × ${selRanges.length} plage${selRanges.length > 1 ? "s" : ""} = ${selDays.length * selRanges.length} créneaux)`
          : "les créneaux sélectionnés"}
      </button>
    </fieldset>
  )
}

// ─── Sélecteur meetup ───────────────────────────────────────────────────────
function MeetupSlotPicker({
  slots,
  onAdd,
  onRemove,
}: {
  slots: MeetupSlot[]
  onAdd: (slots: MeetupSlot[]) => void
  onRemove: (id: string) => void
}) {
  const [selDays, setSelDays] = useState<string[]>([])
  const [selHours, setSelHours] = useState<number[]>([])

  const toggleDay = (d: string) =>
    setSelDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const toggleHour = (h: number) =>
    setSelHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]))

  const allDays = selDays.length === DAYS.length
  const allHours = selHours.length === 24

  const handleAdd = () => {
    if (!selDays.length || !selHours.length) return
    const toAdd: MeetupSlot[] = []
    for (const day of selDays) {
      for (const h of selHours) {
        const label = `${day} ${String(h).padStart(2, "0")}h`
        if (!slots.some((s) => s.label === label)) {
          toAdd.push({
            id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            label,
            hour: h,
            days: [day],
          })
        }
      }
    }
    if (toAdd.length) { onAdd(toAdd); setSelDays([]); setSelHours([]) }
  }

  return (
    <fieldset className="space-y-4">
      <legend className="flex items-center gap-2 text-sm font-bold text-accent">
        <Users className="h-4 w-4" aria-hidden="true" />
        Créneaux meet-up
        <span className="text-xs font-normal text-muted-foreground">(heure par heure)</span>
      </legend>

      {/* Tags existants */}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-background/40 p-3">
          {slots.map((s) => (
            <SlotTag key={s.id} label={s.label} onRemove={() => onRemove(s.id)} />
          ))}
        </div>
      )}

      {/* Sélection jours */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jours</span>
          <button
            type="button"
            onClick={() => setSelDays(allDays ? [] : [...DAYS])}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {allDays ? "Désélectionner tout" : "Sélectionner tout"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <ToggleChip key={d} label={DAYS_SHORT[i]} selected={selDays.includes(d)} onClick={() => toggleDay(d)} />
          ))}
        </div>
      </div>

      {/* Sélection heures */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heures</span>
          <button
            type="button"
            onClick={() => setSelHours(allHours ? [] : [...MEETUP_HOURS])}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {allHours ? "Désélectionner tout" : "Sélectionner tout"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MEETUP_HOURS.map((h) => (
            <ToggleChip
              key={h}
              label={`${String(h).padStart(2, "0")}h`}
              selected={selHours.includes(h)}
              onClick={() => toggleHour(h)}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!selDays.length || !selHours.length}
        className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Ajouter {selDays.length > 0 && selHours.length > 0
          ? `(${selDays.length} jour${selDays.length > 1 ? "s" : ""} × ${selHours.length}h = ${selDays.length * selHours.length} créneaux)`
          : "les créneaux sélectionnés"}
      </button>
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
    getCartConfig().then(setForm).catch(() => setError("Impossible de charger les créneaux."))
  }, [])

  const save = async () => {
    if (!form) return
    setSaving(true); setSaved(false); setError(null)
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

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Créneaux &amp; conditions du panier</h2>
          <p className="text-sm text-muted-foreground">Sélectionne plusieurs jours et plages en une fois puis clique sur Ajouter.</p>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-5">

        {/* Montant minimum */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-accent">Montant minimum pour la livraison</legend>
          <p className="text-xs text-muted-foreground">En dessous de ce montant seul le meet-up est proposé.</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={form.minDeliveryAmount}
              onChange={(e) => setForm({ ...form, minDeliveryAmount: Number(e.target.value) })}
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="text-sm text-muted-foreground">€</span>
          </div>
        </fieldset>

        {/* Livraison */}
        <div className="border-t border-border pt-5">
          <DeliverySlotPicker
            slots={form.deliverySlots}
            onAdd={(added) => setForm({ ...form, deliverySlots: [...form.deliverySlots, ...added] })}
            onRemove={(id) => setForm({ ...form, deliverySlots: form.deliverySlots.filter((s) => s.id !== id) })}
          />
        </div>

        {/* Meetup */}
        <div className="border-t border-border pt-5">
          <MeetupSlotPicker
            slots={form.meetupSlots}
            onAdd={(added) => setForm({ ...form, meetupSlots: [...form.meetupSlots, ...added] })}
            onRemove={(id) => setForm({ ...form, meetupSlots: form.meetupSlots.filter((s) => s.id !== id) })}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> :
           saved  ? <Check className="h-4 w-4" aria-hidden="true" /> :
                    <Save className="h-4 w-4" aria-hidden="true" />}
          {saved ? "Enregistré" : saving ? "Enregistrement…" : "Enregistrer les créneaux"}
        </button>
      </div>
    </div>
  )
}
