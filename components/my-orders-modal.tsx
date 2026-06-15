"use client"

import { useEffect, useState } from "react"
import { X, ArrowLeft, Package, Send, Loader2 } from "lucide-react"
import { getThreadsForCustomer, getThread, addMessage } from "@/app/actions/messaging"
import { getStatusMeta, isPastStatus } from "@/lib/order-status"

type UserData = { pseudo?: string } | null

type MyOrdersModalProps = {
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
  scheduledDate: string | null
  scheduledSlot: string | null
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

export function MyOrdersModal({ isOpen, onClose, userData }: MyOrdersModalProps) {
  const name = userData?.pseudo ?? ""
  const [threads, setThreads] = useState<Thread[]>([])
  const [tab, setTab] = useState<"en_cours" | "passees">("en_cours")
  const [loadingList, setLoadingList] = useState(false)
  const [selected, setSelected] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)

  // Charge la liste des commandes du client à l'ouverture
  useEffect(() => {
    if (!isOpen || !name) return
    setLoadingList(true)
    getThreadsForCustomer(name)
      .then((data) => setThreads(data as Thread[]))
      .catch(() => setThreads([]))
      .finally(() => setLoadingList(false))
  }, [isOpen, name])

  const openThread = async (thread: Thread) => {
    setSelected(thread)
    setLoadingThread(true)
    setMessages([])
    try {
      const data = await getThread(thread.id)
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

  const handleClose = () => {
    setSelected(null)
    setMessages([])
    setReply("")
    setTab("en_cours")
    onClose()
  }

  const currentThreads = threads.filter((t) => !isPastStatus(t.status))
  const pastThreads = threads.filter((t) => isPastStatus(t.status))
  const shownThreads = tab === "en_cours" ? currentThreads : pastThreads

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mes commandes"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-accent/40 bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setMessages([])
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                aria-label="Retour"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <h2 className="text-xl font-bold">{selected ? `Commande #${selected.id}` : "Mes commandes"}</h2>
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

        {/* Liste des commandes */}
        {!selected && (
          <>
            {/* Onglets */}
            <div className="flex gap-2 border-b border-border px-6 pt-4">
              <button
                type="button"
                onClick={() => setTab("en_cours")}
                className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  tab === "en_cours"
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                En cours{currentThreads.length > 0 ? ` (${currentThreads.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("passees")}
                className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  tab === "passees"
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Mes commandes passées{pastThreads.length > 0 ? ` (${pastThreads.length})` : ""}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingList ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              ) : shownThreads.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10" aria-hidden="true" />
                  <p className="text-sm">
                    {tab === "en_cours" ? "Aucune commande en cours." : "Aucune commande passée."}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {shownThreads.map((t) => {
                    const meta = getStatusMeta(t.status)
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => openThread(t)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent"
                        >
                          <div>
                            <div className="font-semibold">Commande #{t.id}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(t.createdAt)} · {t.total}€
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
          </>
        )}

        {/* Détail d'un fil */}
        {selected && (
          <>
            {/* Statut courant de la commande */}
            <div className="flex items-center gap-2 border-b border-border bg-background/40 px-6 py-3">
              <span className="text-xs text-muted-foreground">Statut :</span>
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${getStatusMeta(selected.status).badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${getStatusMeta(selected.status).dot}`} aria-hidden="true" />
                {getStatusMeta(selected.status).label}
              </span>
            </div>

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
                          {isClient ? "Vous" : "Vendeur"} · {formatDate(m.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Zone de réponse */}
            <div className="border-t border-border p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Écrire un message au vendeur..."
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
