"use client"

import { useEffect, useRef, useState } from "react"
import { X, ArrowLeft, Package, Send, Loader2 } from "lucide-react"
import { getThreadsForToken, getLockerOrdersForToken, getThread, addMessage } from "@/app/actions/messaging"
import { statusMeta, isClosedStatus } from "@/lib/order-status"

type UserData = { pseudo?: string; token?: string } | null

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
  const token = userData?.token ?? ""
  const [threads, setThreads] = useState<Thread[]>([])
  const [tab, setTab] = useState<"active" | "locker" | "past">("active")
  const [lockerThreads, setLockerThreads] = useState<Thread[]>([])
  const [lockerLoading, setLockerLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [selected, setSelected] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)

  // Suit la commande ouverte pour le rafraîchissement périodique des messages
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected?.id ?? null

  // Charge la liste des commandes du client à l'ouverture (par clé secrète)
  useEffect(() => {
    if (!isOpen || !token) return
    setLoadingList(true)
    getThreadsForToken(token)
      .then((data) => setThreads(data as Thread[]))
      .catch(() => setThreads([]))
      .finally(() => setLoadingList(false))
    // Charge aussi les commandes locker
    setLockerLoading(true)
    getLockerOrdersForToken(token)
      .then((data) => setLockerThreads(data as Thread[]))
      .catch(() => setLockerThreads([]))
      .finally(() => setLockerLoading(false))
  }, [isOpen, token])

  // Rafraîchissement en direct pendant que la modale est ouverte :
  // - liste des commandes (nouveaux statuts)
  // - messages du fil ouvert (réponses du vendeur)
  useEffect(() => {
    if (!isOpen || !token) return
    const interval = setInterval(async () => {
      try {
        const [list, lockerList] = await Promise.all([
          getThreadsForToken(token),
          getLockerOrdersForToken(token),
        ])
        setThreads(list as Thread[])
        setLockerThreads(lockerList as Thread[])
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
    setTab("active")
    setLockerThreads([])
    onClose()
  }

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
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Onglets */}
            <div className="flex gap-1 border-b border-border px-6 pt-4">
              {(
                [
                  { key: "active" as const, label: "En cours" },
                  { key: "locker" as const, label: "En locker" },
                  { key: "past" as const, label: "Passees" },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative px-3 pb-3 text-sm font-medium transition-colors ${
                    tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>

            {/* Vue locker : liste des commandes locker du client */}
            {tab === "locker" && !selected && (
              <div className="flex-1 overflow-y-auto p-4">
                {lockerLoading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  </div>
                ) : lockerThreads.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                    <Package className="h-10 w-10 opacity-40" aria-hidden="true" />
                    <p className="text-sm text-pretty">Aucune commande Locker pour le moment.</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lockerThreads.map((t) => {
                      const meta = statusMeta(t.status)
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => openThread(t)}
                            className="flex w-full items-center justify-between rounded-2xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-secondary"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold">Commande #{t.id}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)} · {t.total}€ · Livraison 3–5j</span>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className={`flex-1 overflow-y-auto p-6 ${tab === "locker" && !selected ? "hidden" : ""}`}>
              {loadingList ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                </div>
              ) : (
                (() => {
                  const list = threads.filter((t) =>
                    tab === "past" ? isClosedStatus(t.status) : !isClosedStatus(t.status),
                  )
                  if (list.length === 0) {
                    return (
                      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                        <Package className="h-10 w-10" aria-hidden="true" />
                        <p className="text-sm">
                          {tab === "past" ? "Aucune commande passée." : "Aucune commande en cours."}
                        </p>
                      </div>
                    )
                  }
                  return (
                    <ul className="flex flex-col gap-3">
                      {list.map((t) => {
                        const meta = statusMeta(t.status)
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
                  )
                })()
              )}
            </div>
          </div>
        )}

        {/* Détail d'un fil */}
        {selected && (
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
