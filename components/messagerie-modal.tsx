"use client"

import { useEffect, useRef, useState } from "react"
import { X, ArrowLeft, MessageSquare, Send, Loader2, FlaskConical, Package } from "lucide-react"
import {
  getThreadsForToken,
  getThread,
  addMessage,
  createGeneralInquiryThread,
  markThreadRead,
} from "@/app/actions/messaging"
import { statusMeta } from "@/lib/order-status"

type UserData = { pseudo?: string; token?: string } | null

type MessagerieModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
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

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function MessagerieModal({ isOpen, onClose, userData }: MessagerieModalProps) {
  const token = userData?.token ?? ""
  const name = userData?.pseudo ?? "Client"
  const [threads, setThreads] = useState<Thread[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [view, setView] = useState<"list" | "compose" | "thread">("list")
  const [selected, setSelected] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [composeText, setComposeText] = useState("")
  const [creating, setCreating] = useState(false)

  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected?.id ?? null

  // Charge la liste des discussions du client à l'ouverture.
  useEffect(() => {
    if (!isOpen || !token) return
    setLoadingList(true)
    getThreadsForToken(token)
      .then((data) => setThreads(data as Thread[]))
      .catch(() => setThreads([]))
      .finally(() => setLoadingList(false))
  }, [isOpen, token])

  // Rafraîchit la liste et le fil ouvert pendant que la modale est ouverte.
  useEffect(() => {
    if (!isOpen || !token) return
    const interval = setInterval(async () => {
      try {
        const list = await getThreadsForToken(token)
        setThreads(list as Thread[])
        if (selectedRef.current != null) {
          const data = await getThread(selectedRef.current)
          if (data) setMessages(data.messages as Message[])
        }
      } catch {
        // silencieux
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [isOpen, token])

  const openThread = async (thread: Thread) => {
    setSelected(thread)
    setView("thread")
    setLoadingThread(true)
    setMessages([])
    try {
      const [data] = await Promise.all([
        getThread(thread.id),
        markThreadRead(thread.id),
      ])
      if (data) setMessages(data.messages as Message[])
    } finally {
      setLoadingThread(false)
    }
  }

  const handleSend = async () => {
    if (!selected || !reply.trim() || sending) return
    setSending(true)
    try {
      await addMessage(selected.id, "client", reply)
      const data = await getThread(selected.id)
      if (data) setMessages(data.messages as Message[])
      setReply("")
    } finally {
      setSending(false)
    }
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

  const title =
    view === "thread"
      ? selected?.status === "discussion"
        ? "Discussion"
        : `Commande #${selected?.id}`
      : view === "compose"
        ? "Contacter le chimiste"
        : "Messagerie"

  return (
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

        {/* Liste des discussions */}
        {view === "list" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border p-4">
              <button
                type="button"
                onClick={() => setView("compose")}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold uppercase tracking-wide text-accent-foreground transition-opacity hover:opacity-90"
              >
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
                Contacter le chimiste
              </button>

            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingList ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              ) : threads.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                  <MessageSquare className="h-10 w-10" aria-hidden="true" />
                  <p className="text-sm">Aucune discussion pour le moment.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {threads.map((t) => {
                    const meta = statusMeta(t.status)
                    const isGeneral = t.status === "discussion"
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => openThread(t)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                              {isGeneral ? (
                                <FlaskConical className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <Package className="h-4 w-4" aria-hidden="true" />
                              )}
                            </span>
                            <div>
                              <div className="font-semibold">
                                {isGeneral ? "Discussion générale" : `Commande #${t.id}`}
                              </div>
                              <div className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</div>
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
                          {isClient ? "Vous" : "Le chimiste"} · {formatDate(m.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Écrire un message..."
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
  )
}
