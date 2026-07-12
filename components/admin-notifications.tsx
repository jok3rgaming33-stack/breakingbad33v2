"use client"

import { useState, useRef, useCallback } from "react"
import {
  Bell, Send, Users, User, Upload, X, Loader2, Check,
  ImageIcon, Clock, ChevronDown, ChevronUp, RotateCcw,
} from "lucide-react"
import { sendBroadcastNotification } from "@/app/actions/notifications"
import { uploadMedia } from "@/lib/upload-media"
import type { BroadcastNotificationRow } from "@/app/actions/notifications"
import type { AdminUserRow } from "@/app/actions/account"

type Props = {
  initialHistory: BroadcastNotificationRow[]
  users: AdminUserRow[]
}

type RecipientMode = "all" | "select"

export function AdminNotifications({ initialHistory, users }: Props) {
  const [history, setHistory] = useState(initialHistory)

  // Formulaire
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all")
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set())
  const [searchUser, setSearchUser] = useState("")

  // Upload image
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState("")

  // Envoi
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState("")
  const [sent, setSent] = useState<number | null>(null)

  // Historique expand
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadErr("")
    try {
      const media = await uploadMedia(file)
      setImageUrl(media.url)
    } catch (err: unknown) {
      setUploadErr(err instanceof Error ? err.message : "Erreur upload.")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }, [])

  const toggleToken = (token: string) => {
    setSelectedTokens(prev => {
      const next = new Set(prev)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }

  const filteredUsers = users.filter(u =>
    !searchUser || (u.pseudo ?? "").toLowerCase().includes(searchUser.toLowerCase())
  )

  const handleSend = async () => {
    setSendErr("")
    setSent(null)
    const t = title.trim()
    const b = body.trim()
    if (!t) { setSendErr("Le titre est requis."); return }
    if (!b) { setSendErr("Le message est requis."); return }
    if (recipientMode === "select" && selectedTokens.size === 0) {
      setSendErr("Sélectionne au moins un destinataire."); return
    }
    setSending(true)
    try {
      const recipients: "all" | string[] =
        recipientMode === "all" ? "all" : Array.from(selectedTokens)
      const res = await sendBroadcastNotification({
        title: t, body: b,
        imageUrl: imageUrl || undefined,
        recipients,
      })
      if (!res.ok) { setSendErr(res.error ?? "Erreur."); return }
      setSent(res.sentCount)
      setHistory(prev => [{
        id: Date.now(),
        title: t, body: b,
        imageUrl: imageUrl || null,
        recipients: recipientMode === "all" ? "all" : JSON.stringify(Array.from(selectedTokens)),
        sentCount: res.sentCount,
        createdAt: new Date(),
      }, ...prev])
      // Reset
      setTitle("")
      setBody("")
      setImageUrl("")
      setSelectedTokens(new Set())
      setRecipientMode("all")
    } finally {
      setSending(false)
    }
  }

  const recipientLabel = (raw: string, count: number) => {
    if (raw === "all") return `Tous les membres (${count})`
    try {
      const tokens: string[] = JSON.parse(raw)
      return `${tokens.length} membre${tokens.length > 1 ? "s" : ""} ciblé${tokens.length > 1 ? "s" : ""}`
    } catch { return `${count} membre${count > 1 ? "s" : ""}` }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-foreground">Notifications</h2>
          <p className="text-sm text-muted-foreground">Envoie un message directement dans la messagerie des clients.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Formulaire */}
        <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
          <h3 className="font-semibold text-foreground">Nouvelle notification</h3>

          {/* Titre */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="notif-title">
              Titre <span className="text-destructive">*</span>
            </label>
            <input
              id="notif-title"
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setSent(null) }}
              placeholder="Ex : Nouvelle arrivée, Offre spéciale..."
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="notif-body">
              Message <span className="text-destructive">*</span>
            </label>
            <textarea
              id="notif-body"
              rows={5}
              value={body}
              onChange={e => { setBody(e.target.value); setSent(null) }}
              placeholder="Rédige ton message ici..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          {/* Image (optionnelle) */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Image <span className="text-muted-foreground text-xs">(optionnel)</span></p>
            {imageUrl ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Aperçu" className="h-28 w-auto rounded-xl border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white shadow"
                  aria-label="Supprimer l'image"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {uploading
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Upload className="h-4 w-4" aria-hidden="true" />
                }
                {uploading ? "Upload en cours..." : "Uploader une image depuis ton terminal"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            {uploadErr && <p className="mt-1.5 text-xs text-destructive">{uploadErr}</p>}
          </div>

          {/* Erreur / Succès */}
          {sendErr && (
            <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <X className="h-4 w-4 shrink-0" aria-hidden="true" />
              {sendErr}
            </p>
          )}
          {sent !== null && (
            <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              Notification envoyée à <strong>{sent} membre{sent > 1 ? "s" : ""}</strong>.
            </p>
          )}

          {/* Bouton envoyer */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {sending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />
            }
            {sending ? "Envoi en cours..." : "Envoyer la notification"}
          </button>
        </div>

        {/* Destinataires */}
        <div className="rounded-3xl border border-border bg-card p-5 space-y-4 self-start">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Destinataires
          </h3>

          {/* Mode */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setRecipientMode("all"); setSelectedTokens(new Set()) }}
              className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                recipientMode === "all"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50"
              }`}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Tous ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setRecipientMode("select")}
              className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                recipientMode === "select"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50"
              }`}
            >
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Ciblé
            </button>
          </div>

          {/* Sélection individuelle */}
          {recipientMode === "select" && (
            <div className="space-y-2">
              <input
                type="text"
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                placeholder="Rechercher un pseudo..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
              />
              <div className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-border bg-background p-1">
                {filteredUsers.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Aucun membre.</p>
                )}
                {filteredUsers.map(u => {
                  const sel = selectedTokens.has(u.token)
                  return (
                    <button
                      key={u.token}
                      type="button"
                      onClick={() => toggleToken(u.token)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        sel ? "bg-accent/15 text-accent" : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        sel ? "border-accent bg-accent" : "border-border"
                      }`}>
                        {sel && <Check className="h-3 w-3 text-accent-foreground" aria-hidden="true" />}
                      </span>
                      <span className="flex-1 truncate font-medium">{u.pseudo ?? "—"}</span>
                      <ImageIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
              {selectedTokens.size > 0 && (
                <p className="text-xs text-accent font-medium">
                  {selectedTokens.size} membre{selectedTokens.size > 1 ? "s" : ""} sélectionné{selectedTokens.size > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historique */}
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Historique des envois
          </h3>
          <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {history.length} notification{history.length > 1 ? "s" : ""}
          </span>
        </div>
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
            <Bell className="mb-3 h-8 w-8 opacity-30" aria-hidden="true" />
            <p className="text-sm">Aucune notification envoyée pour le moment.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map(n => {
              const date = new Date(n.createdAt)
              const expanded = expandedId === n.id
              return (
                <li key={n.id} className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : n.id)}
                    className="flex w-full items-start gap-4 text-left"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.body}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                        {n.sentCount} envoyé{n.sentCount > 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {expanded
                      ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    }
                  </button>
                  {expanded && (
                    <div className="mt-3 ml-12 space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{n.body}</p>
                      {n.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={n.imageUrl} alt="Image notification" className="mt-2 h-24 w-auto rounded-lg border border-border object-cover" />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {recipientLabel(n.recipients, n.sentCount)}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
