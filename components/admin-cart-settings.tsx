"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Save, Check, Clock, Trash2, CalendarClock, Plus, Users } from "lucide-react"
import {
  getCartConfig,
  setCartConfig,
  type CartConfig,
  type DeliverySlot,
  type MeetupSlot,
} from "@/app/actions/settings"

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

// ─── Tag individuel (ex: "Lundi 18h-20h") ────────────────────────────────────
function SlotTag({
  label,
  active,
  onRemove,
}: {
  label: string
  active?: boolean
  onRemove: () => void
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-mono transition-colors ${
        active
          ? "border-accent/60 bg-accent/10 text-accent"
          : "border-border bg-background/50 text-foreground"
      }`}
    >
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

// ─── Section créneaux avec tags + champ d'ajout ────────────────────────────
function SlotSection({
  icon,
  title,
  description,
  placeholder,
  tags,
  onAdd,
  onRemove,
}: {
  icon: React.ReactNode
  title: string
  description: string
  placeholder: string
  tags: { id: string; label: string }[]
  onAdd: (label: string) => void
  onRemove: (id: string) => void
}) {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const v = input.trim()
    if (!v) return
    onAdd(v)
    setInput("")
    inputRef.current?.focus()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      commit()
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-semibold text-accent">
        {icon}
        {title}
      </legend>
      <p className="text-xs text-muted-foreground">{description}</p>

      {/* Tags */}
      <div className="flex min-h-[2.5rem] flex-wrap gap-2 rounded-xl border border-border bg-background/40 p-3">
        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Aucun créneau — ajoutes-en ci-dessous.</span>
        )}
        {tags.map((t, i) => (
          <SlotTag
            key={t.id}
            label={t.label}
            active={i % 2 === 0}
            onRemove={() => onRemove(t.id)}
          />
        ))}
      </div>

      {/* Champ d'ajout */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={commit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Ajouter le créneau"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Appuie sur <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-mono text-xs">Entrée</kbd> ou clique{" "}
        <Plus className="inline h-3 w-3" aria-hidden="true" /> pour ajouter. Le libellé est libre (ex&nbsp;: <em>Lundi 18h-20h</em>).
      </p>
    </fieldset>
  )
}

// ─── Composant principal ────────────────────────────────────────────────────
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

  // Helpers livraison
  const addDelivery = (label: string) => {
    // Parse heures depuis le label si possible (ex: "Lundi 18h-20h" ou "18H-20H")
    const match = label.match(/(\d{1,2})[hH][\s\-–]*(\d{1,2})[hH]/)
    const startHour = match ? parseInt(match[1], 10) : 14
    const endHour = match ? parseInt(match[2], 10) : 17
    const slot: DeliverySlot = {
      id: `d-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      startHour,
      endHour,
    }
    setForm({ ...form, deliverySlots: [...form.deliverySlots, slot] })
  }
  const removeDelivery = (id: string) =>
    setForm({ ...form, deliverySlots: form.deliverySlots.filter((s) => s.id !== id) })

  // Helpers meet-up
  const addMeetup = (label: string) => {
    const match = label.match(/(\d{1,2})[hH]/)
    const hour = match ? parseInt(match[1], 10) : 18
    const slot: MeetupSlot = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      hour,
    }
    setForm({ ...form, meetupSlots: [...form.meetupSlots, slot] })
  }
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

        {/* Référence jours */}
        <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jours de la semaine</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <span key={d} className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
                {d}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Utilise ces noms dans tes libellés, ex&nbsp;: <em>Lundi 18h-20h</em> ou <em>Sam 14h-18h</em>.
          </p>
        </div>

        {/* Créneaux livraison */}
        <div className="border-t border-border pt-5">
          <SlotSection
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            title="Créneaux de livraison"
            description="Chaque tag correspond à un créneau proposé au client dans le panier. Format libre : 'Lundi 18h-20h', 'Mardi 20h-23h'…"
            placeholder="Ex: Lundi 18h-20h"
            tags={form.deliverySlots}
            onAdd={addDelivery}
            onRemove={removeDelivery}
          />
        </div>

        {/* Créneaux meet-up */}
        <div className="border-t border-border pt-5">
          <SlotSection
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            title="Créneaux meet-up"
            description="Chaque tag correspond à un créneau de retrait proposé au client. Format libre : 'Mercredi 17h', 'Jeudi 19h-20h'…"
            placeholder="Ex: Mercredi 17h"
            tags={form.meetupSlots}
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
