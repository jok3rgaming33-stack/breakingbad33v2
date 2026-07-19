"use client"

import { useState, useCallback } from "react"
import {
  Bell, Send, Users, User, Upload, X, Loader2, Check,
  Clock, ChevronDown, ChevronUp, History, PlusCircle, Eye, EyeOff,
} from "lucide-react"
import { sendBroadcastNotification, getNotificationReads } from "@/app/actions/notifications"
import { uploadMedia } from "@/lib/upload-media"
import { BlobMedia } from "@/components/blob-media"
import type { BroadcastNotificationRow } from "@/app/actions/notifications"
import type { AdminUserRow } from "@/app/actions/account"

type Props = {
  initialHistory: BroadcastNotificationRow[]
  users: AdminUserRow[]
}

type RecipientMode = "all" | "select"
type InnerTab = "send" | "history"

export function AdminNotifications({ initialHistory, users }: Props) {
  const [activeTab, setActiveTab] = useState<InnerTab>("send")
  const [history, setHistory] = useState(initialHistory)

  // --- Formulaire ---
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all")
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set())
  const [searchUser, setSearchUser] = useState("")

  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState("")

  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState("")
  const [sent, setSent] = useState<number | null>(null)

  // --- Historique ---
  const [expandedId, setExpandedId] = useState<number | null>(null)
  // Map notificationId -> tableau de tokens ayant lu
  const [reads, setReads] = useState<Record<number, { customerToken: string; readAt: Date | string }[]>>({})
  const [loadingReads, setLoadingReads] = useState<number | null>(null)

  const toggleExpand = useCallback(async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!reads[id]) {
      setLoadingReads(id)
      try {
        const result = await getNotificationReads(id)
        setReads(prev => ({ ...prev, [id]: result }))
      } catch { /* best-effort */ } finally {
        setLoadingReads(null)
      }
    }
  }, [expandedId, reads])

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
      const newEntry = {
        id: Date.now(),
        title: t, body: b,
        imageUrl: imageUrl || null,
        recipients: recipientMode === "all" ? "all" : JSON.stringify(Array.from(selectedTokens)),
        sentCount: res.sentCount,
        createdAt: new Date(),
      }
      setHistory(prev => [newEntry, ...prev])
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

  const fmtDate = (d: Date | string) => {
    const dt = new Date(d)
    return `${dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} ${dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
  }

  return (
    <div className="space-y-5">
      {/* En-tête + onglets */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-foreground">Notifications</h2>
            <p className="text-sm text-muted-foreground">Push + messagerie simultanément.</p>
          </div>
        </div>

        {/* Onglets secondaires */}
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setActiveTab("send")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "send"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Envoyer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            Suivi
            {history.length > 0 && (
              <span className={`rounded-lg px-1.5 py-0.5 text-xs font-bold ${
                activeTab === "history" ? "bg-accent-foreground/20 text-accent-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ===== ONGLET ENVOYER ===== */}
      {activeTab === "send" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Formulaire */}
          <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
            <h3 className="font-semibold text-foreground">Nouvelle notification</h3>

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

            {/* Image */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">
                Image <span className="text-muted-foreground text-xs">(optionnel)</span>
              </p>
              {imageUrl ? (
                <div className="relative w-full overflow-hidden rounded-xl border border-border bg-secondary/40">
                  <BlobMedia
                    src={imageUrl}
                    alt="Apercu de la piece jointe"
                    className="max-h-64 w-full object-contain"
                    videoProps={{
                      controls: true,
                      muted: true,
                      playsInline: true,
                      preload: "metadata",
                      style: { maxHeight: "256px", width: "100%", objectFit: "contain" },
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow backdrop-blur transition-colors hover:bg-background"
                    aria-label="Supprimer l'image"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-accent ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Upload className="h-4 w-4" aria-hidden="true" />
                  }
                  {uploading ? "Upload en cours..." : "Uploader une image"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                </label>
              )}
              {uploadErr && <p className="mt-1.5 text-xs text-destructive">{uploadErr}</p>}
            </div>

            {sendErr && (
              <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                {sendErr}
              </p>
            )}
            {sent !== null && (
              <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                Notification envoyée (push + messagerie) à <strong>{sent} membre{sent > 1 ? "s" : ""}</strong>.
              </p>
            )}

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
              {sending ? "Envoi en cours..." : "Envoyer (push + messagerie)"}
            </button>
          </div>

          {/* Destinataires */}
          <div className="rounded-3xl border border-border bg-card p-5 space-y-4 self-start">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Destinataires
            </h3>

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
      )}

      {/* ===== ONGLET SUIVI ===== */}
      {activeTab === "history" && (
        <div className="rounded-3xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Historique des envois
            </h3>
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {history.length} notification{history.length > 1 ? "s" : ""}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="mb-3 h-8 w-8 opacity-30" aria-hidden="true" />
              <p className="text-sm">Aucune notification envoyée pour le moment.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {history.map(n => {
                const expanded = expandedId === n.id
                const notifReads = reads[n.id] ?? null
                const readTokens = new Set((notifReads ?? []).map(r => r.customerToken))

                // Calcule la mailing list de cette notification
                let recipientTokens: string[] = []
                if (n.recipients === "all") {
                  // Pour "all" on affiche tous les users
                } else {
                  try { recipientTokens = JSON.parse(n.recipients) } catch { recipientTokens = [] }
                }
                const isAll = n.recipients === "all"
                const targetUsers = isAll ? users : users.filter(u => recipientTokens.includes(u.token))
                const readCount = notifReads ? targetUsers.filter(u => readTokens.has(u.token)).length : null

                return (
                  <li key={n.id} className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => toggleExpand(n.id)}
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
                        <span className="flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Envoyee · {n.sentCount}
                        </span>
                        {/* Badge lu/non-lu — chargé au premier expand */}
                        {loadingReads === n.id ? (
                          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          </span>
                        ) : readCount !== null ? (
                          <span className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${readCount > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            {readCount}/{targetUsers.length} lu{readCount > 1 ? "s" : ""}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {fmtDate(n.createdAt)}
                        </span>
                      </div>
                      {expanded
                        ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      }
                    </button>

                    {expanded && (
                      <div className="mt-3 ml-12 space-y-3 rounded-xl border border-border bg-secondary/20 p-4">
                        {/* Apercu du contenu exact envoyé */}
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titre push</p>
                          <p className="text-sm font-medium text-foreground">BreakingBad33 — {n.title}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Message</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{n.body}</p>
                        </div>
                        {n.imageUrl && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={n.imageUrl} alt="Image notification" className="max-h-48 w-full rounded-lg border border-border object-contain bg-secondary/40" />
                          </div>
                        )}
                        {/* Tableau lu / non-lu par membre */}
                        {notifReads !== null && targetUsers.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Suivi reception ({readCount}/{targetUsers.length})
                            </p>
                            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background">
                              {targetUsers.map(u => {
                                const hasRead = readTokens.has(u.token)
                                const readEntry = (notifReads ?? []).find(r => r.customerToken === u.token)
                                return (
                                  <div key={u.token} className="flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0">
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${hasRead ? "bg-emerald-500/20" : "bg-secondary"}`}>
                                      {hasRead
                                        ? <Eye className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                                        : <EyeOff className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                      }
                                    </span>
                                    <span className="flex-1 truncate text-xs font-medium text-foreground">{u.pseudo ?? "—"}</span>
                                    {hasRead && readEntry && (
                                      <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {fmtDate(readEntry.readAt)}
                                      </span>
                                    )}
                                    {!hasRead && (
                                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                                        Non recu
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            {recipientLabel(n.recipients, n.sentCount)}
                          </p>
                          <span className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            {n.sentCount} livré{n.sentCount > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
