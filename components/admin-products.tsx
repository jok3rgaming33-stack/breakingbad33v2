"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Trash2, Pencil, Minus, X, Loader2, PackagePlus, Save } from "lucide-react"
import { BADGE_OPTIONS } from "@/lib/badges"
import { listProducts, saveProduct, deleteProduct, adjustStock, type ProductInput } from "@/app/actions/products"
import type { Product, ProductVariant } from "@/lib/db/schema"

type FormState = {
  id?: number
  title: string
  section: "featured" | "arrival"
  image: string
  symbol: string
  number: string
  description: string
  fullDescription: string
  stock: number
  variants: ProductVariant[]
  badges: string[]
  discountType: "" | "percent" | "fixed"
  discountValue: number
}

const EMPTY: FormState = {
  title: "",
  section: "featured",
  image: "",
  symbol: "",
  number: "",
  description: "",
  fullDescription: "",
  stock: 0,
  variants: [{ qty: 1, price: 0 }],
  badges: [],
  discountType: "",
  discountValue: 0,
}

function toForm(p: Product): FormState {
  return {
    id: p.id,
    title: p.title,
    section: p.section === "arrival" ? "arrival" : "featured",
    image: p.image ?? "",
    symbol: p.symbol ?? "",
    number: p.number ?? "",
    description: p.description ?? "",
    fullDescription: p.fullDescription ?? "",
    stock: p.stock,
    variants: p.variants?.length ? p.variants : [{ qty: 1, price: 0 }],
    badges: p.badges ?? [],
    discountType: (p.discountType as "percent" | "fixed" | null) ?? "",
    discountValue: p.discountValue ?? 0,
  }
}

export function AdminProducts() {
  const { data: products, mutate, isLoading } = useSWR("admin-products", () => listProducts())
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openNew = () => {
    setError(null)
    setForm({ ...EMPTY })
  }
  const openEdit = (p: Product) => {
    setError(null)
    setForm(toForm(p))
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    const input: ProductInput = {
      id: form.id,
      title: form.title,
      section: form.section,
      image: form.image,
      symbol: form.symbol,
      number: form.number,
      description: form.description,
      fullDescription: form.fullDescription,
      stock: form.stock,
      variants: form.variants,
      badges: form.badges,
      discountType: form.discountType || null,
      discountValue: form.discountType ? form.discountValue : null,
    }
    const res = await saveProduct(input)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? "Erreur lors de l'enregistrement.")
      return
    }
    setForm(null)
    mutate()
  }

  const handleDelete = async (id: number) => {
    await deleteProduct(id)
    mutate()
  }

  const quickStock = async (id: number, delta: number) => {
    await adjustStock(id, delta)
    mutate()
  }

  const toggleBadge = (key: string) => {
    if (!form) return
    setForm({
      ...form,
      badges: form.badges.includes(key) ? form.badges.filter((b) => b !== key) : [...form.badges, key],
    })
  }

  const updateVariant = (i: number, field: "qty" | "price", val: number) => {
    if (!form) return
    const variants = form.variants.map((v, idx) => (idx === i ? { ...v, [field]: val } : v))
    setForm({ ...form, variants })
  }
  const addVariant = () => form && setForm({ ...form, variants: [...form.variants, { qty: 1, price: 0 }] })
  const removeVariant = (i: number) =>
    form && setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) })

  const featured = products?.filter((p) => p.section === "featured") ?? []
  const arrivals = products?.filter((p) => p.section === "arrival") ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestion des produits</h2>
          <p className="text-sm text-muted-foreground">Ajoute, modifie le stock, les badges et les promotions.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Nouveau produit
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        </div>
      ) : (
        <div className="space-y-8">
          {(
            [
              ["En vedette (Best-Seller)", featured],
              ["Nouveautés", arrivals],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun produit.</p>
                )}
                {list.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.variants?.length ?? 0} variante(s)
                          {p.discountType ? ` · promo ${p.discountValue}${p.discountType === "percent" ? "%" : "€"}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          aria-label="Modifier"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {p.badges?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.badges.map((b) => {
                          const meta = BADGE_OPTIONS.find((o) => o.key === b)
                          return meta ? (
                            <span key={b} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                              {meta.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}

                    {/* Stock temps réel */}
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-background/60 p-2">
                      <span className="text-xs text-muted-foreground">Stock</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => quickStock(p.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          aria-label="Diminuer le stock"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className={`w-8 text-center font-mono font-bold ${p.stock <= 0 ? "text-destructive" : ""}`}>
                          {p.stock}
                        </span>
                        <button
                          onClick={() => quickStock(p.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          aria-label="Augmenter le stock"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => quickStock(p.id, 10)}
                          className="rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/25"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire (drawer) */}
      {form && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-background/80 backdrop-blur-sm" onClick={() => setForm(null)}>
          <div
            className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-bold">{form.id ? "Modifier le produit" : "Nouveau produit"}</h3>
              <button
                onClick={() => setForm(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <Field label="Titre">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input"
                  placeholder="Nom du produit"
                />
              </Field>

              <Field label="Destination">
                <select
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value as "featured" | "arrival" })}
                  className="input"
                >
                  <option value="featured">En vedette (Best-Seller)</option>
                  <option value="arrival">Nouveautés</option>
                </select>
              </Field>

              <Field label="Lien de l'image (URL)">
                <input
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  className="input"
                  placeholder="/pdt/exemple.png ou https://..."
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Symbole">
                  <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="input" />
                </Field>
                <Field label="Code / numéro">
                  <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input" />
                </Field>
              </div>

              <Field label="Description courte">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label="Description complète">
                <textarea
                  value={form.fullDescription}
                  onChange={(e) => setForm({ ...form, fullDescription: e.target.value })}
                  rows={3}
                  className="input resize-none"
                />
              </Field>

              <Field label="Quantité en stock">
                <input
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  className="input"
                />
              </Field>

              {/* Variantes */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Variantes (quantité / prix €)</span>
                  <button onClick={addVariant} className="flex items-center gap-1 text-xs text-accent hover:underline">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter
                  </button>
                </div>
                <div className="space-y-2">
                  {form.variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={v.qty}
                        onChange={(e) => updateVariant(i, "qty", Number(e.target.value))}
                        className="input w-1/2"
                        placeholder="Qté"
                      />
                      <input
                        type="number"
                        min={0}
                        value={v.price}
                        onChange={(e) => updateVariant(i, "price", Number(e.target.value))}
                        className="input w-1/2"
                        placeholder="Prix €"
                      />
                      <button
                        onClick={() => removeVariant(i)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                        aria-label="Retirer la variante"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges multiples */}
              <div>
                <span className="mb-2 block text-sm font-medium">Badges (multiples)</span>
                <div className="flex flex-wrap gap-2">
                  {BADGE_OPTIONS.map((b) => {
                    const active = form.badges.includes(b.key)
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => toggleBadge(b.key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                          active ? b.className : "border border-border bg-background/60 text-muted-foreground"
                        }`}
                      >
                        {b.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Le badge « En réappro » s'ajoute aussi automatiquement quand le stock est bas.
                </p>
              </div>

              {/* Promo par article */}
              <div>
                <span className="mb-2 block text-sm font-medium">Promotion sur cet article</span>
                <div className="flex items-center gap-2">
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as "" | "percent" | "fixed" })}
                    className="input w-1/2"
                  >
                    <option value="">Aucune</option>
                    <option value="percent">Réduction %</option>
                    <option value="fixed">Réduction €</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    disabled={!form.discountType}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                    className="input w-1/2 disabled:opacity-40"
                    placeholder={form.discountType === "percent" ? "%" : "€"}
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="border-t border-border px-6 py-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
