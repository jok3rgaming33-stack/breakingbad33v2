"use client"

import { useState } from "react"
import useSWR from "swr"
import { Ticket, Trash2, Plus, Loader2, Power } from "lucide-react"
import { listPromoCodes, savePromoCode, deletePromoCode, type PromoCode } from "@/app/actions/promo"

export function AdminPromos() {
  const { data: codes, mutate, isLoading } = useSWR("admin-promos", () => listPromoCodes())
  const [code, setCode] = useState("")
  const [type, setType] = useState<"fixed" | "percent">("fixed")
  const [value, setValue] = useState(10)
  const [minAmount, setMinAmount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    const res = await savePromoCode({ code, type, value, minAmount, active: true })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur.")
      return
    }
    setCode("")
    setValue(10)
    setMinAmount(0)
    mutate()
  }

  const toggleActive = async (c: PromoCode) => {
    await savePromoCode({ id: c.id, code: c.code, type: c.type as "fixed" | "percent", value: c.value, minAmount: c.minAmount, active: !c.active })
    mutate()
  }

  const handleDelete = async (id: number) => {
    await deletePromoCode(id)
    mutate()
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Codes promo globaux</h2>
        <p className="text-sm text-muted-foreground">
          Crée des codes saisissables par tous les clients dans le panier. Les remises par article se gèrent dans l'onglet
          Produits.
        </p>
      </div>

      {/* Création */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input font-mono" placeholder="BB33-PROMO" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as "fixed" | "percent")} className="input">
              <option value="fixed">Montant €</option>
              <option value="percent">Pourcentage %</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Valeur ({type === "percent" ? "%" : "€"})</span>
            <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Min. d'achat (€)</span>
            <input type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))} className="input" />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving || !code.trim()}
          className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Créer le code
        </button>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        </div>
      ) : (codes?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun code promo pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {codes!.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Ticket className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-mono font-bold">{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.type === "percent" ? `-${c.value}%` : `-${c.value}€`}
                    {c.minAmount > 0 ? ` · min. ${c.minAmount}€` : ""}
                    {c.active ? "" : " · désactivé"}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => toggleActive(c)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    c.active ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"
                  }`}
                  aria-label={c.active ? "Désactiver" : "Activer"}
                  title={c.active ? "Désactiver" : "Activer"}
                >
                  <Power className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
