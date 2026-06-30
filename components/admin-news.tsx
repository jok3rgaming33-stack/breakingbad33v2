"use client"

import { useEffect, useState } from "react"
import {
  listNews,
  getNewsWithSlides,
  createNews,
  updateNews,
  deleteNews,
  upsertSlide,
  deleteSlide,
  publishAndNotify,
  type SlideInput,
} from "@/app/actions/news"
import { uploadMedia } from "@/lib/upload-media"
import {
  Newspaper,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Send,
  ImageIcon,
  Ticket,
  Save,
  CheckCircle2,
  Upload,
  X,
} from "lucide-react"

type NewsRow = {
  id: number
  title: string
  isActive: boolean
  createdAt: Date | string
  updatedAt: Date | string
  slideCount: number
}

type Slide = {
  id: number
  newsId: number
  order: number
  title: string | null
  content: string | null
  imageUrl: string | null
  buttonText: string | null
  buttonLink: string | null
  promoCode: string | null
  promoType: string | null
  promoValue: number | null
  productName: string | null
  minAmount: number | null
  isSingleUse: boolean
}

export function AdminNews() {
  const [list, setList] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState("")
  const [slides, setSlides] = useState<Slide[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [publishedId, setPublishedId] = useState<number | null>(null)
  // Index du slide en cours d'upload d'image (pour afficher le spinner localement).
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const refreshList = async () => {
    setLoading(true)
    try {
      setList((await listNews()) as NewsRow[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshList()
  }, [])

  const openNews = async (id: number) => {
    setSelectedId(id)
    setLoadingDetail(true)
    try {
      const data = await getNewsWithSlides(id)
      if (data) {
        setTitle(data.news.title)
        setSlides(data.slides as Slide[])
      }
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCreate = async () => {
    setBusy(true)
    try {
      const { id } = await createNews("Nouvelle annonce")
      await refreshList()
      await openNews(id)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveTitle = async () => {
    if (!selectedId) return
    await updateNews(selectedId, { title })
    await refreshList()
  }

  const handleDeleteNews = async (id: number) => {
    setBusy(true)
    try {
      await deleteNews(id)
      setSelectedId(null)
      await refreshList()
    } finally {
      setBusy(false)
    }
  }

  const handlePublish = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      const res = await publishAndNotify(selectedId)
      if (res.ok) {
        setPublishedId(selectedId)
        setTimeout(() => setPublishedId(null), 3000)
        await refreshList()
      }
    } finally {
      setBusy(false)
    }
  }

  // Ajoute un slide vierge localement (sera persisté au premier enregistrement).
  const addLocalSlide = () => {
    setSlides((prev) => [
      ...prev,
      {
        id: 0,
        newsId: selectedId ?? 0,
        order: prev.length,
        title: "",
        content: "",
        imageUrl: "",
        buttonText: "",
        buttonLink: "",
        promoCode: "",
        promoType: "fixed",
        promoValue: null,
        productName: "",
        minAmount: null,
        isSingleUse: true,
      },
    ])
  }

  const updateSlideField = (idx: number, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  // Upload d'une image depuis l'appareil vers Blob, puis renseigne l'URL du slide.
  const handleImageUpload = async (idx: number, file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Veuillez sélectionner une image.")
      return
    }
    setUploadError(null)
    setUploadingIdx(idx)
    try {
      const { url } = await uploadMedia(file)
      updateSlideField(idx, { imageUrl: url })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Échec de l'envoi.")
    } finally {
      setUploadingIdx(null)
    }
  }

  const saveSlide = async (idx: number) => {
    if (!selectedId) return
    const s = slides[idx]
    setBusy(true)
    try {
      const input: SlideInput = {
        id: s.id || undefined,
        order: idx,
        title: s.title,
        content: s.content,
        imageUrl: s.imageUrl,
        buttonText: s.buttonText,
        buttonLink: s.buttonLink,
        promoCode: s.promoCode,
        promoType: (s.promoType as "percent" | "fixed" | "produit" | null) ?? "fixed",
        promoValue: s.promoValue,
        productName: s.productName,
        minAmount: s.minAmount,
        isSingleUse: s.isSingleUse,
      }
      await upsertSlide(selectedId, input)
      const data = await getNewsWithSlides(selectedId)
      if (data) setSlides(data.slides as Slide[])
      await refreshList()
    } finally {
      setBusy(false)
    }
  }

  const removeSlide = async (idx: number) => {
    const s = slides[idx]
    if (s.id) {
      setBusy(true)
      try {
        await deleteSlide(s.id)
        if (selectedId) {
          const data = await getNewsWithSlides(selectedId)
          if (data) setSlides(data.slides as Slide[])
        }
        await refreshList()
      } finally {
        setBusy(false)
      }
    } else {
      setSlides((prev) => prev.filter((_, i) => i !== idx))
    }
  }

  /* --------------------------- Vue liste --------------------------- */
  if (selectedId == null) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-lg font-bold">News &amp; annonces</h2>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            Nouvelle annonce
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <Newspaper className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm">Aucune annonce. Crée ta première news.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((n) => (
              <li key={n.id}>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4">
                  <button type="button" onClick={() => openNews(n.id)} className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{n.title}</span>
                      {n.isActive && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                          En ligne
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{n.slideCount} slide(s)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNews(n.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Supprimer l'annonce"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  /* --------------------------- Vue édition --------------------------- */
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePublish}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {publishedId === selectedId ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {publishedId === selectedId ? "Publié + notifié" : "Publier + Notifier"}
          </button>
        </div>
      </div>

      {/* Titre de la news */}
      <div className="mb-6">
        <label htmlFor="news-title" className="mb-2 block text-sm font-medium">
          Titre de l&apos;annonce
        </label>
        <div className="flex gap-2">
          <input
            id="news-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            className="flex-1 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
          />
          <button
            type="button"
            onClick={handleSaveTitle}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Slides */}
      {loadingDetail ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {slides.map((s, idx) => (
            <div key={s.id || `local-${idx}`} className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Slide {idx + 1}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveSlide(idx)}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlide(idx)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Supprimer le slide"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <input
                  value={s.title ?? ""}
                  onChange={(e) => updateSlideField(idx, { title: e.target.value })}
                  placeholder="Titre du slide"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                />
                <textarea
                  value={s.content ?? ""}
                  onChange={(e) => updateSlideField(idx, { content: e.target.value })}
                  placeholder="Contenu / description"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                />
                <div className="flex flex-col gap-2">
                  {s.imageUrl ? (
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.imageUrl || "/placeholder.svg"} alt="Aperçu du slide" className="max-h-40 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => updateSlideField(idx, { imageUrl: "" })}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Retirer l'image"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <label
                      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:border-accent ${
                        uploadingIdx === idx ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      {uploadingIdx === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden="true" />
                      )}
                      Importer
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleImageUpload(idx, f)
                          e.target.value = ""
                        }}
                      />
                    </label>
                    <div className="flex w-full items-center gap-2">
                      <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <input
                        value={s.imageUrl ?? ""}
                        onChange={(e) => updateSlideField(idx, { imageUrl: e.target.value })}
                        placeholder="ou colle une URL d'image"
                        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                      />
                    </div>
                  </div>
                  {uploadError && uploadingIdx === null && (
                    <p className="text-xs text-destructive">{uploadError}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={s.buttonText ?? ""}
                    onChange={(e) => updateSlideField(idx, { buttonText: e.target.value })}
                    placeholder="Texte du bouton"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <input
                    value={s.buttonLink ?? ""}
                    onChange={(e) => updateSlideField(idx, { buttonLink: e.target.value })}
                    placeholder="Lien du bouton"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                  />
                </div>

                {/* Promotion */}
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent">
                    <Ticket className="h-4 w-4" aria-hidden="true" />
                    Promotion (optionnel)
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      value={s.promoCode ?? ""}
                      onChange={(e) => updateSlideField(idx, { promoCode: e.target.value.toUpperCase() })}
                      placeholder="Code promo (ex. WELCOME10)"
                      className="w-full rounded-xl border border-border bg-card px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={s.promoType ?? "fixed"}
                        onChange={(e) => updateSlideField(idx, { promoType: e.target.value })}
                        className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent [color-scheme:dark]"
                      >
                        <option value="fixed">€ fixe</option>
                        <option value="percent">% pourcent</option>
                        <option value="produit">Produit offert</option>
                      </select>
                      <input
                        type="number"
                        value={s.promoValue ?? ""}
                        onChange={(e) =>
                          updateSlideField(idx, { promoValue: e.target.value ? Number(e.target.value) : null })
                        }
                        placeholder={s.promoType === "produit" ? "Nb offert" : "Valeur"}
                        className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                      />
                      <input
                        type="number"
                        value={s.minAmount ?? ""}
                        onChange={(e) =>
                          updateSlideField(idx, { minAmount: e.target.value ? Number(e.target.value) : null })
                        }
                        placeholder="Min. €"
                        className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                      />
                    </div>
                    {s.promoType === "produit" && (
                      <input
                        value={s.productName ?? ""}
                        onChange={(e) => updateSlideField(idx, { productName: e.target.value })}
                        placeholder="Nom du produit offert (ex. X-Taze)"
                        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                      />
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={s.isSingleUse}
                        onChange={(e) => updateSlideField(idx, { isSingleUse: e.target.checked })}
                        className="h-4 w-4 rounded border-border accent-[var(--accent)]"
                      />
                      Usage unique par client
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLocalSlide}
            className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un slide
          </button>
        </div>
      )}
    </div>
  )
}
