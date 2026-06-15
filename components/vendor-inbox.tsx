"use client"

import { useState, useTransition } from "react"
import type { OrderThread, ThreadMessage } from "@/lib/db/schema"
import { getThread, addMessage, updateThreadStatus } from "@/app/actions/messaging"
import { getStatusMeta, ORDER_STATUSES, PENDING_STATUS } from "@/lib/order-status"
import { Inbox, Send, Loader2, Truck, Store } from "lucide-react"

function formatDate(value: Date | string) {
  const d = new Date(value)
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function VendorInbox({ initialThreads }: { initialThreads: OrderThread[] }) {
  const [threads, setThreads] = useState(initialThreads)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [isPending, startTransition] = useTransition()

  const selected = threads.find((t) => t.id === selectedId) ?? null

  const openThread = async (id: number) => {
    setSelectedId(id)
    setLoadingThread(true)
    const data = await getThread(id)
    setMessages(data?.messages ?? [])
    setLoadingThread(false)
  }

  const sendReply = () => {
    if (!reply.trim() || selectedId == null) return
    const body = reply.trim()
    setReply("")
    startTransition(async () => {
      await addMessage(selectedId, "vendeur", body)
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    })
  }

  const changeStatus = (status: string) => {
    if (selectedId == null) return
    startTransition(async () => {
      await updateThreadStatus(selectedId, status)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status } : t)))
    })
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      {/* Liste des fils */}
      <aside className="flex max-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Inbox className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Commandes reçues</h2>
          <span className="ml-auto text-xs text-muted-foreground">{threads.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune commande pour le moment.</p>
          )}
          <ul>
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openThread(t.id)}
                  className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary ${
                    selectedId === t.id ? "bg-secondary" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.customerName}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusMeta(t.status).badge}`}>
                      {getStatusMeta(t.status).label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t.fulfillment === "meetup" ? (
                      <Store className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Truck className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>{t.total}€</span>
                    <span aria-hidden="true">•</span>
                    <span>{formatDate(t.createdAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Détail du fil */}
      <section className="flex max-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Sélectionne une commande pour voir le détail et répondre au client.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">{selected.customerName}</h2>
                <p className="text-xs text-muted-foreground">
                  {selected.fulfillment === "meetup" ? "Retrait meet-up" : "Livraison"} · {selected.scheduledDate}
                  {selected.scheduledSlot ? ` · ${selected.scheduledSlot}` : ""}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${getStatusMeta(selected.status).badge}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusMeta(selected.status).dot}`} aria-hidden="true" />
                  {getStatusMeta(selected.status).label}
                </span>
                <select
                  value={ORDER_STATUSES.some((s) => s.key === selected.status) ? selected.status : ""}
                  onChange={(e) => changeStatus(e.target.value)}
                  disabled={isPending}
                  aria-label="Changer le statut de la commande"
                  className="rounded-full border border-input bg-background px-3 py-1.5 text-xs font-medium outline-none transition-colors focus:border-accent disabled:opacity-50"
                >
                  <option value="" disabled>
                    {PENDING_STATUS.label}
                  </option>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.sender === "vendeur" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                        m.sender === "vendeur"
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 text-[10px] text-muted-foreground">
                      {m.sender === "vendeur" ? "Vous" : selected.customerName} · {formatDate(m.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendReply()
                    }
                  }}
                  rows={1}
                  placeholder="Répondre au client..."
                  className="max-h-32 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={isPending || !reply.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  aria-label="Envoyer la réponse"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
