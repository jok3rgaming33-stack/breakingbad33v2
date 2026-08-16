"use client"

import { useEffect, useRef, useState } from "react"
import { X, ArrowLeft, Package, Send, Loader2, Lock, Bell, BellOff, ShieldAlert, Paperclip, FlaskConical, Star } from "lucide-react"
import { VoiceNoteButton } from "@/components/voice-note-button"
import {
  getThreadsForToken,
  getLockerOrdersForToken,
  getThreadForToken,
  addMessage,
  consumeTrkThread,
  notifyDeposit,
  markThreadReadForToken,
} from "@/app/actions/messaging"
import { statusMeta, isClosedStatus } from "@/lib/order-status"
import { splitThreadForTracking, type OrderTrackingState } from "@/lib/order-timeline"
import { OrderTrackingCard } from "@/components/order-tracking-card"
import { MessageBody } from "@/components/message-body"
import { BlobMedia } from "@/components/blob-media"
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

type MyOrdersModalProps = {
  isOpen: boolean
  onClose: () => void
  userData: UserData
  /** Deep-link : ouvrir ce fil (commandes / trk / locker) */
  focusThreadId?: number | null
  focusTab?: "active" | "locker" | "past" | null
  onFocusConsumed?: () => void
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
  trackingToken: string
  depositNotified?: boolean
  depositConfirmed?: boolean
  xmrWallet?: string | null
  createdAt: Date | string
  updatedAt: Date | string
  tracking?: OrderTrackingState | null
  colissimoNumber?: string | null
}

type Message = {
  id: number
  threadId: number
  sender: string
  body: string
  createdAt: Date | string
}

// Vérifie si un fil est un message TRK à auto-supprimer après lecture
function isTrkMessage(t: Thread) {
  return t.status === "trk_token"
}

export function MyOrdersModal({
  isOpen,
  onClose,
  userData,
  focusThreadId = null,
  focusTab = null,
  onFocusConsumed,
}: MyOrdersModalProps) {
  const token = userData?.token ?? ""
  const [threads, setThreads] = useState<Thread[]>([])
  const [tab, setTab] = useState<"active" | "locker" | "past">("active")
  // Locker : verrou TRK_ avant d'afficher
  const [lockerTokenInput, setLockerTokenInput] = useState("")
  const [lockerTokenError, setLockerTokenError] = useState("")
  const [lockerUnlocked, setLockerUnlocked] = useState<number | null>(null) // id du thread déverrouillé
  const [lockerThreads, setLockerThreads] = useState<Thread[]>([])
  const [lockerLoading, setLockerLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [selected, setSelected] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [ratingThreadId, setRatingThreadId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Notification push
  const [pushSupported, setPushSupported] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  // Depot XMR
  const [depositSending, setDepositSending] = useState(false)
  const [depositSent, setDepositSent] = useState(false)

  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selected?.id ?? null

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushSupported(true)
      setPushGranted(Notification.permission === "granted")
    }
  }, [])

  const requestPush = async () => {
    if (!("Notification" in window)) return
    const perm = await Notification.requestPermission()
    setPushGranted(perm === "granted")
  }

  const loadLists = async () => {
    if (!token) return
    const [list, lockerList] = await Promise.all([
      getThreadsForToken(token),
      getLockerOrdersForToken(token),
    ])
    // Exclure les broadcasts admin (ils sont dans Messagerie → Discussions)
    const ordersOnly = (list as Thread[]).filter((t) => t.status !== "notification")
    setThreads(sortByActivityDesc(ordersOnly))
    setLockerThreads(sortByActivityDesc(lockerList as Thread[]))
  }

  useEffect(() => {
    if (!isOpen || !token) return
    setLoadingList(true)
    loadLists().finally(() => setLoadingList(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen || !token) return
    const interval = setInterval(async () => {
      await loadLists()
      if (selectedRef.current != null) {
        const data = await getThreadForToken(selectedRef.current, token)
        if (data) {
          setMessages(data.messages as Message[])
          if (data.thread) {
            setSelected((s) => (s && s.id === data.thread.id ? { ...s, ...data.thread } : s))
          }
          await markThreadReadForToken(selectedRef.current, token)
        }
      }
    }, 8000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token])

  // Synchronise selectedRef avec selected pour que le polling toutes les 8s
  // rafraichisse bien les messages du fil ouvert.
  useEffect(() => {
    selectedRef.current = selected?.id ?? null
  }, [selected])

  // Deep-link depuis cloche / push — une seule fois (évite rebond sur refresh polling)
  const lastFocusedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isOpen) {
      lastFocusedRef.current = null
      return
    }
    if (!focusThreadId) return
    if (lastFocusedRef.current === focusThreadId) return
    if (focusTab) setTab(focusTab)
    const fromOrders = threads.find((t) => t.id === focusThreadId)
    const fromLocker = lockerThreads.find((t) => t.id === focusThreadId)
    const t = fromOrders || fromLocker
    if (!t) return
    lastFocusedRef.current = focusThreadId
    if (fromLocker && !fromOrders) {
      setTab("locker")
      setLockerUnlocked(t.id)
    } else if (isTrkMessage(t)) {
      setTab("active")
    } else if (isClosedStatus(t.status)) {
      setTab("past")
    } else {
      setTab("active")
    }
    void openThread(t)
    onFocusConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusThreadId, threads, lockerThreads, focusTab])

  const openThread = async (thread: Thread) => {
    setSelected(thread)
    setLoadingThread(true)
    setMessages([])
    setDepositSent(false)
    try {
      const [data] = await Promise.all([
        getThreadForToken(thread.id, token),
        markThreadReadForToken(thread.id, token),
      ])
      if (data) {
        setMessages(data.messages as Message[])
        if (data.thread) setSelected((s) => (s ? { ...s, ...data.thread } : s))
      }
      // Si c'est un fil TRK : le supprimer maintenant que le client l'a ouvert
      if (isTrkMessage(thread)) {
        await consumeTrkThread(thread.id)
        setThreads((prev) => prev.filter((t) => t.id !== thread.id))
      }
    } finally {
      setLoadingThread(false)
    }
  }

  const refreshThreadAfterSend = async (threadId: number) => {
    const data = await getThreadForToken(threadId, token)
    if (!data) return
    setMessages(data.messages as Message[])
    const now = data.thread?.updatedAt ?? new Date().toISOString()
    setSelected((s) => (s && s.id === threadId ? { ...s, ...data.thread, updatedAt: now } : s))
    setThreads((prev) =>
      sortByActivityDesc(prev.map((t) => (t.id === threadId ? { ...t, updatedAt: now } : t))),
    )
    setLockerThreads((prev) =>
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

  const handleDeposit = async () => {
    if (!selected || depositSending) return
    setDepositSending(true)
    try {
      await notifyDeposit(selected.id)
      setDepositSent(true)
      // Recharger les messages
      const data = await getThreadForToken(selected.id, token)
      if (data) setMessages(data.messages as Message[])
    } finally {
      setDepositSending(false)
    }
  }

  const handleLockerUnlock = () => {
    const input = lockerTokenInput.trim().toUpperCase()
    if (!input) { setLockerTokenError("Saisis ton token TRK_."); return }
    const match = lockerThreads.find((t) => t.trackingToken === input)
    if (!match) { setLockerTokenError("Token invalide. Vérifie la saisie."); return }
    setLockerTokenError("")
    setLockerUnlocked(match.id)
    openThread(match)
  }

  const handleClose = () => {
    setSelected(null)
    setMessages([])
    setReply("")
    setTab("active")
    setLockerThreads([])
    setLockerTokenInput("")
    setLockerTokenError("")
    setLockerUnlocked(null)
    onClose()
  }

  const goBack = () => {
    setSelected(null)
    setMessages([])
    setReply("")
    setDepositSent(false)
  }

  if (!isOpen) return null

  // Fil TRK sélectionné : affichage spécial avertissement
  const isTrkSelected = selected && isTrkMessage(selected)
  // Fil locker normal sélectionné
  const isLockerSelected = selected && selected.fulfillment === "locker" && !isTrkMessage(selected)
  // Wallet XMR disponible dans le fil locker sélectionné
  const xmrWallet = (selected as any)?.xmrWallet ?? null
  const depositAlreadyNotified = (selected as any)?.depositNotified ?? false
  const depositAlreadyConfirmed = (selected as any)?.depositConfirmed ?? false

  return (
    <>
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
                onClick={goBack}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-muted"
                aria-label="Retour"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <h2 className="text-xl font-bold">
              {selected
                ? isTrkSelected
                  ? "Token de suivi"
                  : `Commande #${selected.id}`
                : "Mes commandes"}
            </h2>
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
        {!selected && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Onglets */}
            <div className="flex gap-1 border-b border-border px-6 pt-4">
              {([
                { key: "active" as const, label: "En cours" },
                { key: "locker" as const, label: "En locker" },
                { key: "past" as const, label: "Passees" },
              ]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); setLockerTokenInput(""); setLockerTokenError(""); }}
                  className={`relative px-3 pb-3 text-sm font-medium transition-colors ${tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                  {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>

            {/* Onglet locker :
                - Avant confirmation paiement : accès direct (suivre le paiement / signaler dépôt)
                - Après confirmation : verrou TRK_ (token reçu en messagerie) */}
            {tab === "locker" && (
              <div className="flex-1 overflow-y-auto p-5">
                {lockerLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : lockerThreads.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                    <Package className="h-10 w-10 opacity-40" aria-hidden="true" />
                    <p className="text-sm text-pretty">Aucune commande Locker pour le moment.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Commandes en attente de paiement — ouvertes sans TRK */}
                    {(() => {
                      const pendingPay = lockerThreads.filter(
                        (t) => !(t as { depositConfirmed?: boolean }).depositConfirmed,
                      )
                      if (pendingPay.length === 0) return null
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Paiement / en attente
                          </p>
                          <ul className="flex flex-col gap-2">
                            {pendingPay.map((t) => {
                              const method = (t as { paymentMethod?: string | null }).paymentMethod
                              return (
                                <li key={t.id}>
                                  <button
                                    type="button"
                                    onClick={() => openThread(t)}
                                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent"
                                  >
                                    <div>
                                      <div className="text-sm font-semibold">Commande #{t.id}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {t.total}€ · {method === "paysafecard" || method === "wiro" ? "Paysafecard" : "XMR"}
                                      </div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                      Paiement
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )
                    })()}

                    {/* Accès sécurisé TRK pour commandes payées */}
                    <div className="rounded-2xl border border-border bg-background/60 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
                        <p className="text-sm font-semibold">Suivi sécurisé (après paiement)</p>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                        Après confirmation de ton paiement, saisis le token TRK_ reçu en messagerie pour débloquer le suivi détaillé.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={lockerTokenInput}
                          onChange={(e) => { setLockerTokenInput(e.target.value); setLockerTokenError(""); }}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleLockerUnlock() }}
                          placeholder="TRK_XXXXXXXXXXXXXXXX"
                          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={handleLockerUnlock}
                          className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                        >
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          Accéder
                        </button>
                      </div>
                      {lockerTokenError && (
                        <p className="mt-2 text-xs text-destructive">{lockerTokenError}</p>
                      )}
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                      {lockerThreads.length} commande{lockerThreads.length > 1 ? "s" : ""} Locker
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Onglets actif / passées */}
            {tab !== "locker" && (
              <div className="flex-1 overflow-y-auto p-6">
                {/* Activation push */}
                {pushSupported && !pushGranted && (
                  <button
                    type="button"
                    onClick={requestPush}
                    className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/20"
                  >
                    <Bell className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-foreground">Activer les notifications</p>
                      <p className="text-xs text-muted-foreground">Sois alerté en temps réel de l&apos;avancement de ta commande.</p>
                    </div>
                  </button>
                )}
                {pushGranted && (
                  <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-xs text-muted-foreground">
                    <BellOff className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    Notifications activées
                  </div>
                )}
                {loadingList ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                  </div>
                ) : (
                  (() => {
                    const list = threads.filter((t) =>
                      tab === "past" ? isClosedStatus(t.status) : !isClosedStatus(t.status)
                    )
                    if (list.length === 0) {
                      return (
                        <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                          <Package className="h-10 w-10 opacity-30" aria-hidden="true" />
                          <p className="text-sm">{tab === "past" ? "Aucune commande passée." : "Aucune commande en cours."}</p>
                        </div>
                      )
                    }
                    return (
                      <ul className="flex flex-col gap-3">
                        {list.map((t) => {
                          const meta = statusMeta(t.status)
                          const isTrk = isTrkMessage(t)
                          return (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => openThread(t)}
                                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-accent ${isTrk ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-background/60"}`}
                              >
                                <div className="flex flex-col gap-0.5">
                                  {isTrk ? (
                                    <>
                                      <div className="flex items-center gap-1.5 font-semibold text-sm text-amber-400">
                                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                                        Token de suivi Locker
                                      </div>
                                      <span className="text-xs text-muted-foreground">A ouvrir et sauvegarder — message auto-supprimé</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="font-semibold text-sm">Commande #{t.id}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {formatThreadActivity(threadActivityAt(t))} · {t.total}€
                                      </div>
                                    </>
                                  )}
                                </div>
                                {isTrk ? (
                                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                    A lire
                                  </span>
                                ) : (
                                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${meta.badge}`}>
                                    {meta.label}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  })()
                )}
              </div>
            )}
          </div>
        )}

        {/* Détail d'un fil */}
        {selected && (
          <>
            {/* Avertissement TRK */}
            {isTrkSelected && (
              <div className="mx-4 mt-4 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                  <p className="text-sm font-bold text-amber-400">SAUVEGARDE CE TOKEN MAINTENANT</p>
                </div>
                <p className="text-xs leading-relaxed text-amber-300/80">
                  Ce message est supprimé automatiquement une fois lu. Sans ce token tu ne pourras plus accéder au suivi de ta commande Locker.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {loadingThread ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(() => {
                    const { recap, rest } = splitThreadForTracking(messages)
                    const bubble = (m: Message) => {
                      const isClient = m.sender === "client"
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-2xl p-3 text-sm ${isClient ? "self-end bg-accent text-accent-foreground" : "self-start border border-border bg-background/60 text-foreground"}`}
                        >
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                            {isClient ? "Vous" : "Le Chimiste"} · {formatMessageTime(m.createdAt)}
                          </div>
                          <MessageBody
                            body={m.body}
                            onRateProducts={selected ? () => setRatingThreadId(selected.id) : undefined}
                          />
                        </div>
                      )
                    }
                    return (
                      <>
                        {recap && bubble(recap)}
                        {!isTrkSelected && selected.status !== "notification" && selected.status !== "trk_token" && (
                          <OrderTrackingCard
                            orderId={selected.id}
                            status={selected.status}
                            fulfillment={selected.fulfillment}
                            tracking={selected.tracking}
                            createdAt={selected.createdAt}
                            scheduledSlot={selected.scheduledSlot}
                            colissimoNumber={selected.colissimoNumber}
                            className="mb-1"
                          />
                        )}
                        {rest.map(bubble)}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Zone dépôt XMR / Paysafecard (commande validée, paiement pas encore confirmé) */}
            {isLockerSelected && !depositAlreadyConfirmed && (
              (() => {
                const method = (selected as { paymentMethod?: string | null })?.paymentMethod
                const isPsc = method === "paysafecard" || method === "wiro"
                const canNotify =
                  (isPsc && (selected.status === "validee" || selected.status === "preparation")) ||
                  (!isPsc && !!xmrWallet)
                if (!canNotify && !depositAlreadyNotified && !depositSent) return null
                return (
                  <div className="border-t border-border p-4 space-y-2">
                    {isPsc && !depositAlreadyNotified && !depositSent && (
                      <a
                        href="https://www.paysafecard.com/fr-fr/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 py-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
                      >
                        Acheter sur paysafecard.com (officiel)
                      </a>
                    )}
                    {!depositAlreadyNotified && !depositSent ? (
                      canNotify ? (
                        <button
                          type="button"
                          onClick={handleDeposit}
                          disabled={depositSending}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {depositSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {isPsc ? "J'ai envoyé mon code Paysafecard" : "J'ai effectué mon dépôt XMR"}
                        </button>
                      ) : null
                    ) : (
                      <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-center text-sm text-muted-foreground">
                        {isPsc
                          ? "Code signalé — en attente de confirmation par le vendeur."
                          : "Dépôt signalé — en attente de confirmation par le vendeur."}
                      </div>
                    )}
                  </div>
                )
              })()
            )}
            {isLockerSelected && depositAlreadyConfirmed && (
              <div className="border-t border-border p-4">
                <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm font-semibold text-accent">
                  Paiement confirmé — ton colis est en préparation. Token TRK_ envoyé en messagerie.
                </div>
              </div>
            )}

            {/* Zone de réponse */}
            {!isTrkSelected && (
              <div className="border-t border-border p-4">
                {isClosedStatus(selected.status) ? (
                  /* Commande cloturee : lecture seule + notation si livrée + messagerie */
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 text-center">
                    {selected.status === "livree" && (
                      <button
                        type="button"
                        onClick={() => setRatingThreadId(selected.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/60 bg-amber-400/15 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-400/25"
                      >
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                        Noter mes produits
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Cette commande est cloturee. Tu ne peux plus y ecrire.
                    </p>
                    <button
                      type="button"
                      onClick={() => { handleClose(); }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                    >
                      <FlaskConical className="h-4 w-4" aria-hidden="true" />
                      Contacter le chimiste
                    </button>
                  </div>
                ) : (
                  /* Commande active : saisie texte + upload media */
                  <>
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
                        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    {ratingThreadId && (
      <ProductRatingModal
        threadId={ratingThreadId}
        customerToken={token}
        onClose={() => setRatingThreadId(null)}
      />
    )}
    </>
  )
}
