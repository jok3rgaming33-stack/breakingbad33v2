"use client"

import { useState, useRef } from "react"
import useSWR from "swr"
import { Plus, Trash2, Pencil, Minus, X, Loader2, PackagePlus, Save, GripVertical, Upload, FolderPlus, Check } from "lucide-react"
import { BADGE_OPTIONS } from "@/lib/badges"
import { uploadMedia } from "@/lib/upload-media"
import { BlobMedia } from "@/components/blob-media"
import { listProducts, saveProduct, deleteProduct, adjustStock, reorderProducts, type ProductInput } from "@/app/actions/products"
import { listCategories, createCategory, renameCategory, deleteCategory, reorderCategories } from "@/app/actions/categories"
import type { Product, ProductVariant, ProductMedia, Category } from "@/lib/db/schema"

type FormState = {
  id?: number
  title: string
  section: string
  image: string
  media: ProductMedia[]
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

function emptyForm(section: string): FormState {
  return {
    title: "",
    section,
    image: "",
    media: [],
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
}

function toForm(p: Product): FormState {
  return {
    id: p.id,
    title: p.title,
    section: p.section,
    image: p.image ?? "",
    media: p.media ?? [],
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
  const { data: categories, mutate: mutateCats } = useSWR("admin-categories", () => listCategories())
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag & drop produits (réordonnancement au sein d'une catégorie).
  const dragProduct = useRef<{ id: number; section: string } | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<string, number[]>>({})

  const cats = categories ?? []
  const firstKey = cats[0]?.key ?? "featured"

  const openNew = () => {
    setError(null)
    setForm(emptyForm(firstKey))
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
      media: form.media,
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

  const addVariant = () => {
    if (!form) return
    setForm({ ...form, variants: [...form.variants, { qty: 1, price: 0 }] })
  }

  const removeVariant = (i: number) =>
    form && setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) })

  // Produits d'une catégorie dans l'ordre courant (avec réordonnancement local).
  const productsForCat = (key: string): Product[] => {
    const base = (products ?? []).filter((p) => p.section === key)
    const order = localOrder[key]
    if (!order) return base
    const byId = new Map(base.map((p) => [p.id, p]))
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Product[]
    // Ajoute les éventuels nouveaux non présents dans l'ordre local.
    base.forEach((p) => {
      if (!order.includes(p.id)) ordered.push(p)
    })
    return ordered
  }

  const onDropProduct = async (key: string, targetId: number) => {
    const drag = dragProduct.current
    dragProduct.current = null
    if (!drag || drag.section !== key || drag.id === targetId) return
    const current = productsForCat(key).map((p) => p.id)
    const from = current.indexOf(drag.id)
    const to = current.indexOf(targetId)
    if (from < 0 || to < 0) return
    current.splice(to, 0, current.splice(from, 1)[0])
    setLocalOrder((prev) => ({ ...prev, [key]: current }))
    await reorderProducts(current)
    mutate()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Gestion des produits</h2>
          <p className="text-sm text-muted-foreground">Catégories, ordre d&apos;affichage, médias, stock, badges et promotions.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Nouveau produit
        </button>
      </div>

      {/* Gestion des catégories */}
      <CategoryManager categories={cats} onChange={() => { mutateCats(); mutate() }} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {cats.map((cat) => {
            const list = productsForCat(cat.key)
            return (
              <div key={cat.id}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.length === 0 && <p className="text-sm text-muted-foreground">Aucun produit.</p>}
                  {list.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => (dragProduct.current = { id: p.id, section: cat.key })}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropProduct(cat.key, p.id)}
                      className="rounded-2xl border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <GripVertical className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.variants?.length ?? 0} variante(s)
                              {p.media?.length ? ` · ${p.media.length} média(s)` : ""}
                              {p.discountType ? ` · promo ${p.discountValue}${p.discountType === "percent" ? "%" : "€"}` : ""}
                            </div>
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
            )
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-background/80 backdrop-blur-sm" onClick={() => setForm(null)}>
          <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card" onClick={(e) => e.stopPropagation()}>
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
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder="Nom du produit" />
              </Field>

              <Field label="Catégorie">
                <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="input">
                  {cats.map((c) => (
                    <option key={c.id} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <MediaUploader form={form} setForm={setForm} />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Symbole">
                  <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="input" />
                </Field>
                <Field label="Code / numéro">
                  <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input" />
                </Field>
              </div>

              <Field label="Description courte">
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
              </Field>

              <Field label="Description compl��te">
                <textarea value={form.fullDescription} onChange={(e) => setForm({ ...form, fullDescription: e.target.value })} rows={3} className="input resize-none" />
              </Field>

              <Field label="Quantité en stock">
                <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className="input" />
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Variantes (quantité / prix €)</span>
                  <button
                    type="button"
                    onClick={addVariant}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
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
                        type="button"
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
                  Le badge « En réappro » s&apos;ajoute aussi automatiquement quand le stock est bas.
                </p>
              </div>

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

// Gestion des catégories : créer, renommer, supprimer, réordonner par glisser-déposer.
function CategoryManager({ categories, onChange }: { categories: Category[]; onChange: () => void }) {
  const [newName, setNewName] = useState("")
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const dragId = useRef<number | null>(null)
  const [order, setOrder] = useState<number[] | null>(null)

  const list = order ? (order.map((id) => categories.find((c) => c.id === id)).filter(Boolean) as Category[]) : categories

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    await createCategory(name)
    setBusy(false)
    setNewName("")
    setOrder(null)
    onChange()
  }

  const save = async (id: number) => {
    const name = editName.trim()
    if (!name) return
    await renameCategory(id, name)
    setEditingId(null)
    onChange()
  }

  const remove = async (id: number) => {
    if (!window.confirm("Supprimer cette catégorie ? Les produits associés seront déplacés vers une autre catégorie.")) return
    await deleteCategory(id)
    setOrder(null)
    onChange()
  }

  const onDrop = async (targetId: number) => {
    const from = dragId.current
    dragId.current = null
    if (!from || from === targetId) return
    const ids = list.map((c) => c.id)
    const fi = ids.indexOf(from)
    const ti = ids.indexOf(targetId)
    if (fi < 0 || ti < 0) return
    ids.splice(ti, 0, ids.splice(fi, 1)[0])
    setOrder(ids)
    await reorderCategories(ids)
    onChange()
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FolderPlus className="h-4 w-4 text-accent" aria-hidden="true" />
        <span className="text-sm font-semibold">Catégories</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={() => (dragId.current = c.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(c.id)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1.5 text-xs"
          >
            <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" aria-hidden="true" />
            {editingId === c.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-28 rounded border border-border bg-card px-1.5 py-0.5 text-xs outline-none"
                  autoFocus
                />
                <button onClick={() => save(c.id)} className="text-accent" aria-label="Valider">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button onClick={() => setEditingId(null)} className="text-muted-foreground" aria-label="Annuler">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <span className="font-medium">{c.name}</span>
                <button
                  onClick={() => {
                    setEditingId(c.id)
                    setEditName(c.name)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Renommer"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
                <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer">
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add()
          }}
          placeholder="Nouvelle catégorie…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={busy || !newName.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Ajouter
        </button>
      </div>
    </div>
  )
}

// Import d'images/vidéos depuis l'appareil + saisie d'URL d'image principale.
function MediaUploader({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setErr(null)
    const added: ProductMedia[] = []
    for (const file of Array.from(files)) {
      try {
        const { url, type } = await uploadMedia(file)
        added.push({ type, url })
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Échec de l'envoi.")
      }
    }
    // Le premier média importé (image OU vidéo) devient l'image principale si aucune n'est définie.
    const firstMedia = added[0]
    setForm({
      ...form,
      media: [...form.media, ...added],
      image: form.image || firstMedia?.url || "",
    })
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  const removeMedia = (url: string) => {
    setForm({ ...form, media: form.media.filter((m) => m.url !== url), image: form.image === url ? "" : form.image })
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Médias (images / vidéos)</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/60 py-3 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {uploading ? "Envoi…" : "Importer depuis l'appareil"}
      </button>
      {err && <p className="mt-1.5 text-xs text-destructive">{err}</p>}

      {form.media.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {form.media.map((m) => (
            <div key={m.url} className="group relative overflow-hidden rounded-lg border border-border bg-black">
              <BlobMedia
                src={m.url}
                alt="Média produit"
                mediaType={m.type}
                className="w-full object-contain"
                videoProps={{ muted: true, playsInline: true, preload: "metadata", autoPlay: false, loop: false, style: { maxHeight: "120px" } }}
              />
              <button
                type="button"
                onClick={() => removeMedia(m.url)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Retirer"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
              {form.image === m.url && (
                <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                  Principale
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <Field label="Image principale (URL)">
        <input
          value={form.image}
          onChange={(e) => setForm({ ...form, image: e.target.value })}
          className="input"
          placeholder="/pdt/exemple.png ou https://…"
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
