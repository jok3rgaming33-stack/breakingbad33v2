"use client"

import { useEffect, useRef, useState } from "react"
import { X, ArrowLeft, MessageSquare, Send, Loader2, FlaskConical, Package, Paperclip, Star } from "lucide-react"
import { VoiceNoteButton } from "@/components/voice-note-button"
import {
  getThreadsForToken,
  getThreadForToken,
  addMessage,
  createGeneralInquiryThread,
  markThreadReadForToken,
} from "@/app/actions/messaging"
import { statusMeta, isDiscussionStatus, isMessagingThreadStatus } from "@/lib/order-status"
import { MessageBody } from "@/components/message-body"
import { ProductRatingModal } from "@/components/product-rating-modal"
import {
  formatMessageTime,
  formatThreadActivity,
  threadActivityAt,
  sortByActivityDesc,
} from "@/lib/format-time"

async function uploadMessageMedia(
  file: File,
): Promise<{ url: string; type: "image" | "video" | "audio" }> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/messages/upload", { method: "POST", body: fd })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d?.error ?? "Echec de l'envoi.")
  }
  return res.json()
}

function mediaTag(type: string, url: string) {
  if (type === "video") return `[video]${url}[/video]`
  if (type === "audio") return `[audio]${url}[/audio]`
  return `[image]${url}[/image]`
}

type UserData = { pseudo?: string; token?: string } | null

type MessagerieModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
  autoOpenLatest?: boolean
  /** Deep-link : ouvrir directement ce fil (ex. depuis notif / push) */
  focusThreadId?: number | null
  onFocusConsumed?: () => void
  /** Ouvre le guide « Comment ça marche » depuis un empty state */
  onOpenHowItWorks?: () => void
}

type Thread = {
  id: number
  customerName: string
  summary: string
  total: number
  fulfillment: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
}

type Message = {
  id: number
  threadId: number
  sender: string
  body: string
  createdAt: Date | string
}

export function MessagerieModal({
  isOpen,
  onClose,
  userData,
  autoOpenLatest = false,
  focusThreadId = null,
  onFocusConsumed,
  onOpenHowItWorks,
}: MessagerieModalProps) {
  const token = userData?.token ?? ""
  const name = userData?.pseudo ?? "Client"
  const [threads, setThreads] = useState<Thread[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [view, setView] = useState<"list" | "compose" | "thread">("list")
  const [tab, setTab] = useState<"commandes" | "discussions">("commandes")
  const [selected, setSelected] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [composeText, setComposeText] = useState("")
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [ratingThreadId, setRatingThreadId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected?.id ?? null

  // Charge la liste des discussions à l'ouverture.
  useEffect(() => {
    if (!isOpen || !token) return
    setLoadingList(true)
    getThreadsForToken(token)
      .then((data) => setThreads(sortByActivityDesc(data as Thread[])))
      .catch(() => setThreads([]))
      .finally(() => setLoadingList(false))
  }, [isOpen, token])

  // Rafraîchit liste et fil ouvert séparément (le client voyait 8s de retard).
  useEffect(() => {
    if (!isOpen || !token) return
    let cancelled = false
    const pullList = async () => {
      try {
        const list = await getThreadsForToken(token)
        if (!cancelled) setThreads(sortByActivityDesc(list as Thread[]))
      } catch {
        /* silencieux */
      }
    }
    const pullThread = async () => {
      if (selectedRef.current == null) return
      try {
        const data = await getThreadForToken(selectedRef.current, token)
        if (!data || cancelled) return
        setMessages(data.messages as Message[])
        await markThreadReadForToken(selectedRef.current, token)
        if (data.thread) {
          setThreads((prev) =>
            sortByActivityDesc(
              prev.map((t) =>
                t.id === data.thread.id
                  ? { ...t, updatedAt: data.thread.updatedAt, createdAt: data.thread.createdAt }
                  : t,
              ),
            ),
          )
        }
      } catch {
        /* silencieux */
      }
    }
    const listIv = setInterval(() => void pullList(), 6000)
    const threadIv = setInterval(() => void pullThread(), 3000)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pullList()
        void pullThread()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(listIv)
      clearInterval(threadIv)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen || !autoOpenLatest || selected || !threads.length || focusThreadId) return
    void openThread(threads[0])
  }, [autoOpenLatest, isOpen, selected, threads, focusThreadId])

  // Deep-link : ouvrir le fil ciblé UNE seule fois (Discussions pour notifs, Commandes sinon).
  // Ne pas re-dépendre de `threads` : le polling réinjecterait le fil notif et ferait
  // "rebondir" le client hors du fil en cours (ex. pendant la lecture d'un vocal).
  const lastFocusedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isOpen) {
      lastFocusedRef.current = null
      return
    }
    if (!focusThreadId || !threads.length) return
    if (lastFocusedRef.current === focusThreadId) return
    const t = threads.find((x) => x.id === focusThreadId)
    if (!t) return
    lastFocusedRef.current = focusThreadId
    if (isMessagingThreadStatus(t.status)) setTab("discussions")
    else setTab("commandes")
    void openThread(t)
    onFocusConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusThreadId, threads])

  const openThread = async (thread: Thread) => {
    setSelected(thread)
    setView("thread")
    setLoadingThread(true)
    setMessages([])
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }
    try {
      const [data] = await Promise.all([
        getThreadForToken(thread.id, token),
        markThreadReadForToken(thread.id, token),
      ])
      if (data) setMessages(data.messages as Message[])
    } finally {
      setLoadingThread(false)
    }
  }

  const refreshThreadAfterSend = async (threadId: number) => {
    const data = await getThreadForToken(threadId, token)
    if (!data) return
    setMessages(data.messages as Message[])
    const now = data.thread?.updatedAt ?? new Date().toISOString()
    setSelected((s) => (s && s.id === threadId ? { ...s, updatedAt: now } : s))
    setThreads((prev) =>
      sortByActivityDesc(prev.map((t) => (t.id === threadId ? { ...t, updatedAt: now } : t))),
    )
  }

  const handleSend = async () => {
    if (!selected || !reply.trim() || sending) return
    setSending(true)
    try {
      await addMessage(selected.id, "client", reply, token)
      await refreshThreadAfterSend(selected.id)
      setReply("")
    } finally {
      setSending(false)
    }
  }

  const handleVoiceSent = async (body: string) => {
    if (!selected) return
    await addMessage(selected.id, "client", body, token)
    await refreshThreadAfterSend(selected.id)
  }

  const handleCreate = async () => {
    if (!composeText.trim() || creating) return
    setCreating(true)
    try {
      const res = await createGeneralInquiryThread({
        customerName: name,
        customerToken: token || undefined,
        message: composeText,
      })
      if (res.ok) {
        setComposeText("")
        const list = await getThreadsForToken(token)
        setThreads(list as Thread[])
        const created = (list as Thread[]).find((t) => t.id === res.id)
        if (created) await openThread(created)
        else setView("list")
      }
    } finally {
      setCreating(false)
    }
  }

  const handleMediaUpload = async (files: FileList | null) => {
    if (!selected || !files || files.length === 0) return
    setUploading(true)
    setUploadErr(null)
    try {
      for (const file of Array.from(files)) {
        const { url, type } = await uploadMessageMedia(file)
        await addMessage(selected.id, "client", mediaTag(type, url), token)
      }
      await refreshThreadAfterSend(selected.id)
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Echec de l'envoi.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleClose = () => {
    setView("list")
    setSelected(null)
    setMessages([])
    setReply("")
    setComposeText("")
    onClose()
  }

  const goBack = () => {
    setView("list")
    setSelected(null)
    setMessages([])
    setReply("")
    setComposeText("")
  }

  if (!isOpen) return null

  // Rendu de la modale de notation (z-index supérieur à la messagerie)
  const ratingModal = ratingThreadId ? (
    <ProductRatingModal
      threadId={ratingThreadId}
      customerToken={token}
      onClose={() => setRatingThreadId(null)}
    />
  ) : null

  // Commandes réelles uniquement — les broadcasts admin vont dans Discussions
  const orderThreads = threads.filter((t) => !isMessagingThreadStatus(t.status))
  const discussionThreads = threads.filter((t) => isMessagingThreadStatus(t.status))

  const title =
    view === "thread"
      ? selected?.status === "notification"
        ? selected.summary?.replace(/^Notification\s*:\s*/i, "") || "Notification"
        : isDiscussionStatus(selected?.status)
          ? "Discussion"
          : `Commande #${selected?.id}`
      : view === "compose"
        ? "Contacter le chimiste"
        : "Messagerie"

  return (
    <>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Messagerie"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-accent/40 bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div className="flex items-center gap-3">
            {view !== "list" && (
              <button
                type="button"
                onClick={goBack}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                aria-label="Retour"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Liste */}
        {view === "list" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Onglets Commandes / Discussions */}
            <div className="flex gap-1 border-b border-border px-4 pt-3">
              <button
                type="button"
                onClick={() => setTab("commandes")}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "commandes" ? "border-b-2 border-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                Commandes
                {orderThreads.length > 0 && (
                  <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{orderThreads.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("discussions")}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "discussions" ? "border-b-2 border-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Discussions
                {discussionThreads.length > 0 && (
                  <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{discussionThreads.length}</span>
                )}
              </button>
            </div>

            {/* Bouton composer — uniquement dans l'onglet discussions */}
            {tab === "discussions" && (
              <div className="border-b border-border p-3">
                <button
                  type="button"
                  onClick={() => setView("compose")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90"
                >
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  Contacter le chimiste
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {loadingList ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              ) : (
                <>
                  {tab === "commandes" && (
                    <ul className="flex flex-col gap-3">
                      {orderThreads.length === 0 ? (
                        <li className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                          <Package className="h-10 w-10" aria-hidden="true" />
                          <p className="text-sm">Aucune commande pour le moment.</p>
                          <div className="mt-1 flex flex-col items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTab("discussions")
                                setView("compose")
                              }}
                              className="rounded-xl bg-accent px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-accent-foreground"
                            >
                              Écrire au chimiste
                            </button>
                            {onOpenHowItWorks && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose()
                                  onOpenHowItWorks()
                                }}
                                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                              >
                                Comment ça marche ?
                              </button>
                            )}
                          </div>
                        </li>
                      ) : orderThreads.map((t) => {
                        const meta = statusMeta(t.status)
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => openThread(t)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                                  <Package className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                  <div className="font-semibold">{`Commande #${t.id}`}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatThreadActivity(threadActivityAt(t))}
                                  </div>
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${meta.badge}`}>
                                {meta.label}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {tab === "discussions" && (
                    <ul className="flex flex-col gap-3">
                      {discussionThreads.length === 0 ? (
                        <li className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                          <MessageSquare className="h-10 w-10" aria-hidden="true" />
                          <p className="text-sm">Aucune discussion pour le moment.</p>
                          <div className="mt-1 flex flex-col items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setView("compose")}
                              className="rounded-xl bg-accent px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-accent-foreground"
                            >
                              Contacter le chimiste
                            </button>
                            {onOpenHowItWorks && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose()
                                  onOpenHowItWorks()
                                }}
                                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                              >
                                Comment ça marche ?
                              </button>
                            )}
                          </div>
                        </li>
                      ) : discussionThreads.map((t) => {
                        const meta = statusMeta(t.status)
                        const isNotif = t.status === "notification"
                        const label = isNotif
                          ? (t.summary?.replace(/^Notification\s*:\s*/i, "") || "Notification")
                          : `Discussion #${t.id}`
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => openThread(t)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                  <div className="font-semibold line-clamp-1">{label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatThreadActivity(threadActivityAt(t))}
                                  </div>
                                </div>
                              </div>
                              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${meta.badge}`}>
                                {meta.label}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}



        {/* Composer une discussion générale */}
        {view === "compose" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex flex-col items-center gap-3 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <FlaskConical className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="text-sm text-muted-foreground text-pretty">
                  Une question, une demande spéciale ? Écris directement au chimiste, sans passer par une commande.
                </p>
              </div>
              <textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                placeholder="Ton message..."
                rows={5}
                autoFocus
                className="w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm outline-none transition-colors focus:border-accent"
              />
            </div>
            <div className="border-t border-border p-4">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!composeText.trim() || creating}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-5 w-5" aria-hidden="true" />
                )}
                Envoyer au chimiste
              </button>
            </div>
          </div>
        )}

        {/* Détail d'un fil */}
        {view === "thread" && selected && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingThread ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => {
                    const isClient = m.sender === "client"
                    return (
                      <div
                        key={m.id}
                        className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                          isClient
                            ? "self-end bg-accent text-accent-foreground"
                            : "self-start border border-border bg-background/60 text-foreground"
                        }`}
                      >
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          {isClient ? "Vous" : "Le chimiste"} · {formatMessageTime(m.createdAt)}
                        </div>
                        <MessageBody
                          body={m.body}
                          onRateProducts={selected ? () => setRatingThreadId(selected.id) : undefined}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4">
              {selected?.status === "livree" && (
                <button
                  type="button"
                  onClick={() => setRatingThreadId(selected.id)}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/60 bg-amber-400/15 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-400/25"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  Noter mes produits
                </button>
              )}
              {uploadErr && <p className="mb-2 text-xs text-destructive">{uploadErr}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                className="hidden"
                onChange={(e) => handleMediaUpload(e.target.files)}
              />
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/60 text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  aria-label="Joindre une photo, video ou audio"
                  title="Joindre une photo, video ou audio"
                >
                  {uploading
                    ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    : <Paperclip className="h-5 w-5" aria-hidden="true" />
                  }
                </button>
                <VoiceNoteButton
                  disabled={uploading || sending}
                  onSent={handleVoiceSent}
                />
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Ecrire un message..."
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!reply.trim() || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    {ratingModal}
    </>
  )
}
