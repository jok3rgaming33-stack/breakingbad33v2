"use client"

import { useState, useTransition, useEffect, useRef, useCallback } from "react"
import type { OrderThread, ThreadMessage } from "@/lib/db/schema"
import { getThreads, getThread, addMessage, updateThreadStatus } from "@/app/actions/messaging"
import { Inbox, Send, Loader2, Truck, Store } from "lucide-react"
import { VENDOR_STATUS_OPTIONS, STATUS_META, statusMeta, normalizeStatus } from "@/lib/order-status"

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
  // Modale de motif d'annulation
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  const selected = threads.find((t) => t.id === selectedId) ?? null

  // Garde une référence à la commande ouverte pour le rafraîchissement périodique
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  const openThread = async (id: number) => {
    setSelectedId(id)
    setLoadingThread(true)
    const data = await getThread(id)
    setMessages(data?.messages ?? [])
    setLoadingThread(false)
  }

  // Rafraîchissement automatique : nouvelles commandes + messages clients en direct
  const refresh = useCallback(async () => {
    try {
      const latest = await getThreads()
      setThreads(latest)
      const openId = selectedIdRef.current
      if (openId != null) {
        const data = await getThread(openId)
        setMessages(data?.messages ?? [])
      }
    } catch {
      // silencieux : on réessaiera au prochain tick
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(refresh, 8000)
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const sendReply = () => {
    if (!reply.trim() || selectedId == null) return
    const body = reply.trim()
    setReply("")
    startTransition(async () => {
      await addMessage(selectedId, "vendeur", body)
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
      setThreads((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, status: t.status === "nouveau" ? "en cours" : t.status } : t)),
      )
    })
  }

  const changeStatus = (status: string) => {
    if (selectedId == null) return
    // L'annulation passe par une modale pour saisir le motif communiqué au client.
    if (status === "annulee") {
      setCancelReason("")
      setCancelOpen(true)
      return
    }
    startTransition(async () => {
      await updateThreadStatus(selectedId, status)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status } : t)))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    })
  }

  const confirmCancel = () => {
    if (selectedId == null) return
    const reason = cancelReason.trim()
    setCancelOpen(false)
    startTransition(async () => {
      await updateThreadStatus(selectedId, "annulee", reason)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status: "annulee" } : t)))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
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
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta(t.status).badge}`}>
                      {statusMeta(t.status).label}
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
              <div className="ml-auto flex flex-col items-end gap-1.5">
                <label htmlFor="order-status" className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  État notifié au client
                </label>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusMeta(selected.status).badge}`}>
                    {statusMeta(selected.status).label}
                  </span>
                  <select
                    id="order-status"
                    value={normalizeStatus(selected.status) === "en_attente" ? "" : normalizeStatus(selected.status)}
                    onChange={(e) => e.target.value && changeStatus(e.target.value)}
                    disabled={isPending}
                    className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-accent disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Changer le statut…
                    </option>
                    {VENDOR_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>
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

      {/* Modale : motif d'annulation communiqué au client */}
      {cancelOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setCancelOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Annuler la commande</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Indique le motif de l&apos;annulation. Il sera envoyé au client dans la messagerie.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ex. Article en rupture de stock, paiement non reçu…"
              className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={isPending}
                className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
