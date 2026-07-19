"use client"

import { useState, useTransition, useEffect, useRef, useCallback } from "react"
import type { OrderThread, ThreadMessage, Product } from "@/lib/db/schema"
import { getActiveOrders, getLockerOrders, getDiscussions, getPastOrders, getThread, addMessage, updateThreadStatus, deleteOrderThread, sendXmrWallet, confirmDeposit, updateOrderProducts } from "@/app/actions/messaging"
import type { OrderProductItem } from "@/app/actions/messaging"
import { listProducts } from "@/app/actions/products"
import { Inbox, Send, Loader2, Truck, Store, Package, MessageSquare, Trash2, AlertTriangle, Wallet, CheckCircle2, Check, CheckCheck, Clock, ShoppingCart, Plus, Minus, RefreshCw } from "lucide-react"
import { VENDOR_STATUS_OPTIONS, VENDOR_DISCUSSION_STATUS_OPTIONS, STATUS_META, statusMeta, normalizeStatus } from "@/lib/order-status"
import { MessageBody } from "@/components/message-body"

function formatDate(value: Date | string) {
  const d = new Date(value)
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function VendorInbox({
  initialThreads,
  mode = "orders",
}: {
  initialThreads: OrderThread[]
  mode?: "orders" | "locker" | "messages" | "past"
}) {
  const [threads, setThreads] = useState(initialThreads)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [isPending, startTransition] = useTransition()
  // Modale de motif d'annulation
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  // Confirmation de suppression
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Champ Colissimo (affiché uniquement quand on passe en statut "livraison")
  const [colissimoInput, setColissimoInput] = useState("")
  const [colissimoOpen, setColissimoOpen] = useState(false)
  // Modale wallet XMR (locker validée)
  const [xmrModalOpen, setXmrModalOpen] = useState(false)
  const [xmrWalletInput, setXmrWalletInput] = useState("")
  const [xmrSending, setXmrSending] = useState(false)
  // Panneau gestion des articles
  const [productsOpen, setProductsOpen] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [orderItems, setOrderItems] = useState<OrderProductItem[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [savingProducts, setSavingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState("")

  const selected = threads.find((t) => t.id === selectedId) ?? null

  // Ouvre le panneau de gestion des articles et pré-charge les produits + items existants
  const openProductsPanel = useCallback(async () => {
    if (!selected) return
    setProductsOpen(true)
    if (allProducts.length === 0) {
      setLoadingProducts(true)
      const prods = await listProducts()
      setAllProducts(prods)
      setLoadingProducts(false)
    }
    // Parse le champ products texte existant en items structurés (best-effort)
    // Format attendu : "Produit A ×2, Produit B ×1"
    if (selected.products) {
      // on garde les items vides pour l'instant, le vendeur les remplira
    }
    // Initialise avec les articles courants si déjà parsés, sinon vide
    setOrderItems([])
    setProductSearch("")
  }, [selected, allProducts.length])

  // Garde une référence à la commande ouverte pour le rafraîchissement périodique
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  // Ajoute un produit à la liste ou incrémente sa quantité (variante la plus petite par défaut)
  const addProductToOrder = (prod: Product) => {
    const firstVariant = prod.variants?.[0]
    if (!firstVariant) return
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id)
      if (existing) {
        return prev.map((i) => i.productId === prod.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, {
        productId: prod.id,
        title: prod.title,
        qty: firstVariant.qty,
        price: firstVariant.price,
        prevQty: 0,
      }]
    })
    setProductSearch("")
  }

  const updateItemQty = (productId: number, qty: number) => {
    setOrderItems((prev) => prev.map((i) => i.productId === productId ? { ...i, qty: Math.max(0, qty) } : i))
  }

  const updateItemVariant = (productId: number, variantQty: number, prod: Product) => {
    const variant = prod.variants?.find((v) => v.qty === variantQty)
    if (!variant) return
    setOrderItems((prev) => prev.map((i) =>
      i.productId === productId ? { ...i, qty: variant.qty, price: variant.price } : i
    ))
  }

  const removeItemFromOrder = (productId: number) => {
    setOrderItems((prev) => prev.filter((i) => i.productId !== productId))
  }

  const orderTotal = orderItems.reduce((sum, i) => sum + i.qty * i.price, 0)

  const saveOrderProducts = async () => {
    if (!selectedId) return
    setSavingProducts(true)
    try {
      const result = await updateOrderProducts(selectedId, orderItems)
      if (result.ok) {
        setThreads((prev) => prev.map((t) =>
          t.id === selectedId
            ? { ...t, total: result.newTotal, products: orderItems.filter(i => i.qty > 0).map(i => `${i.title} ×${i.qty}`).join(", ") }
            : t
        ))
        const data = await getThread(selectedId)
        setMessages(data?.messages ?? [])
        setProductsOpen(false)
      }
    } finally {
      setSavingProducts(false)
    }
  }

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
      const latest = mode === "messages" ? await getDiscussions() : mode === "locker" ? await getLockerOrders() : mode === "past" ? await getPastOrders() : await getActiveOrders()
      setThreads(latest)
      const openId = selectedIdRef.current
      if (openId != null) {
        const data = await getThread(openId)
        setMessages(data?.messages ?? [])
      }
    } catch {
      // silencieux : on réessaiera au prochain tick
    }
  }, [mode])

  useEffect(() => {
    refresh() // chargement immédiat a l'affichage de l'onglet
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
    // Le passage en "livraison" ouvre une modale pour saisir le numéro Colissimo.
    if (status === "livraison") {
      setColissimoInput("")
      setColissimoOpen(true)
      return
    }
    // Le passage en "validee" pour une commande locker ouvre la modale wallet XMR.
    const currentThread = threads.find((t) => t.id === selectedId)
    if (status === "validee" && currentThread?.fulfillment === "locker") {
      setXmrWalletInput("")
      setXmrModalOpen(true)
      return
    }
    startTransition(async () => {
      await updateThreadStatus(selectedId, status)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status } : t)))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    })
  }

  const confirmLivraison = () => {
    if (selectedId == null) return
    const colissimo = colissimoInput.trim()
    setColissimoOpen(false)
    startTransition(async () => {
      await updateThreadStatus(selectedId, "livraison", undefined, colissimo || undefined)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status: "livraison" } : t)))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    })
  }

  const confirmXmrWallet = async () => {
    if (selectedId == null || !xmrWalletInput.trim()) return
    setXmrSending(true)
    try {
      await sendXmrWallet(selectedId, xmrWalletInput.trim())
      setThreads((prev) => prev.map((t) => t.id === selectedId ? { ...t, status: "validee", xmrWallet: xmrWalletInput.trim() } : t))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    } finally {
      setXmrSending(false)
      setXmrModalOpen(false)
    }
  }

  const handleConfirmDeposit = () => {
    if (selectedId == null) return
    startTransition(async () => {
      await confirmDeposit(selectedId)
      setThreads((prev) => prev.map((t) => t.id === selectedId ? { ...t, depositConfirmed: true, status: "preparation" } : t))
      const data = await getThread(selectedId)
      setMessages(data?.messages ?? [])
    })
  }

  const confirmDelete = async () => {
    if (selectedId == null) return
    setIsDeleting(true)
    try {
      await deleteOrderThread(selectedId)
      setThreads((prev) => prev.filter((t) => t.id !== selectedId))
      setSelectedId(null)
      setMessages([])
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
    }
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
          {mode === "messages"
            ? <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
            : mode === "locker"
              ? <Package className="h-4 w-4 text-accent" aria-hidden="true" />
              : mode === "past"
                ? <CheckCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                : <Inbox className="h-4 w-4 text-accent" aria-hidden="true" />
          }
          <h2 className="text-sm font-semibold">
            {mode === "messages" ? "Messages directs" : mode === "locker" ? "Locker Mondial Relay" : mode === "past" ? "Commandes clôturées" : "Commandes en cours"}
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">{threads.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {mode === "messages" ? "Aucun message direct." : mode === "locker" ? "Aucune commande Locker en cours." : mode === "past" ? "Aucune commande clôturée." : "Aucune commande en cours."}
            </p>
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
                    <div className="flex shrink-0 items-center gap-1">
                      {mode === "messages" && (
                        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-500/30">
                          Discussion
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta(t.status).badge}`}>
                        {statusMeta(t.status).label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t.fulfillment === "meetup" ? (
                      <Store className="h-3 w-3" aria-hidden="true" />
                    ) : t.fulfillment === "locker" ? (
                      <Package className="h-3 w-3" aria-hidden="true" />
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
                  {selected.fulfillment === "meetup" ? "Retrait meet-up" : selected.fulfillment === "locker" ? "Locker Mondial Relay" : "Livraison"} · {selected.scheduledDate ?? "Délai 3–5 jours ouvrés"}
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
                    {(mode === "messages"
                      ? VENDOR_DISCUSSION_STATUS_OPTIONS
                      : VENDOR_STATUS_OPTIONS
                    ).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                  {mode !== "messages" && (
                    <button
                      type="button"
                      onClick={openProductsPanel}
                      className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                      title="Gérer les articles de la commande"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                      Articles
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={isPending || isDeleting}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
                    aria-label="Supprimer la commande"
                    title="Supprimer la commande"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                messages.map((m) => {
                  const isVendeur = m.sender === "vendeur"
                  const readAt = (m as any).clientReadAt as string | null | undefined
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isVendeur ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          isVendeur
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <MessageBody body={m.body} />
                      </div>
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {isVendeur ? "Vous" : selected.customerName} · {formatDate(m.createdAt)}
                        {isVendeur && (
                          readAt
                            ? <span title={`Lu le ${formatDate(readAt)}`} className="flex items-center gap-0.5 text-accent">
                                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                                <span>Lu</span>
                              </span>
                            : <span title="Non lu" className="flex items-center gap-0.5 text-muted-foreground/60">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                <span>Non lu</span>
                              </span>
                        )}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {/* Bandeau dépôt XMR notifié — bouton confirmer */}
            {selected.fulfillment === "locker" && (selected as any).depositNotified && !(selected as any).depositConfirmed && (
              <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-amber-400">Dépôt XMR signalé par le client</p>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">Vérifie la reception sur ton wallet Monero avant de confirmer.</p>
                <button
                  type="button"
                  onClick={handleConfirmDeposit}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Confirmer la réception du dépôt
                </button>
              </div>
            )}

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

      {/* Modale : wallet XMR pour commande locker validée */}
      {xmrModalOpen && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setXmrModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <Wallet className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Adresse wallet XMR — Commande #{selected.id}</h3>
                <p className="text-xs text-muted-foreground">{selected.customerName} · Locker Mondial Relay</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
              Saisis l&apos;adresse du wallet Monero sur lequel le client devra effectuer son dépôt. Elle lui sera transmise dans son suivi locker avec une mise en garde pour qu&apos;il la recopie soigneusement.
            </p>
            <label htmlFor="xmr-wallet" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Adresse wallet XMR
            </label>
            <input
              id="xmr-wallet"
              type="text"
              value={xmrWalletInput}
              onChange={(e) => setXmrWalletInput(e.target.value)}
              autoFocus
              placeholder="4... (adresse Monero complète)"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-accent"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Le client recevra une notification push lui demandant d&apos;ouvrir son suivi locker.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setXmrModalOpen(false)}
                disabled={xmrSending}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmXmrWallet}
                disabled={xmrSending || !xmrWalletInput.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {xmrSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
                Valider et envoyer au client
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : confirmation de suppression définitive */}
      {deleteConfirmOpen && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Supprimer la commande</h3>
                <p className="text-xs text-muted-foreground">Commande #{selected.id} — {selected.customerName}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Cette action est <span className="font-semibold text-foreground">irréversible</span>. La commande et tous ses messages seront définitivement supprimés, côté admin et côté client.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isDeleting}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

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
      {/* Panneau : gestion des articles de la commande */}
      {productsOpen && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 md:items-center"
          onClick={() => setProductsOpen(false)}
        >
          <div
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            style={{ maxHeight: "90dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <ShoppingCart className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">Gérer les articles — Commande #{selected.id}</h3>
                <p className="text-xs text-muted-foreground">{selected.customerName} · Total actuel : {selected.total}€</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Nouveau total</p>
                <p className="text-base font-bold text-foreground">{orderTotal}€</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
              {/* Articles en cours */}
              {orderItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Articles dans la commande</p>
                  {orderItems.map((item) => {
                    const prod = allProducts.find((p) => p.id === item.productId)
                    return (
                      <div key={item.productId} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                        <span className="flex-1 truncate text-sm font-medium">{item.title}</span>
                        {/* Sélecteur de variante */}
                        {prod?.variants && prod.variants.length > 1 && (
                          <select
                            value={item.qty}
                            onChange={(e) => updateItemVariant(item.productId, Number(e.target.value), prod)}
                            className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                          >
                            {prod.variants.map((v) => (
                              <option key={v.qty} value={v.qty}>{v.qty} × {v.price}€</option>
                            ))}
                          </select>
                        )}
                        {/* Contrôle quantité rapide */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateItemQty(item.productId, item.qty - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateItemQty(item.productId, item.qty + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="w-14 text-right text-sm font-semibold">{item.qty * item.price}€</span>
                        <button
                          type="button"
                          onClick={() => removeItemFromOrder(item.productId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Retirer l'article"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Ajout d'un article */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajouter un article</p>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Rechercher un produit…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                {loadingProducts ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                    {allProducts
                      .filter((p) =>
                        !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase())
                      )
                      .map((p) => {
                        const alreadyAdded = orderItems.some((i) => i.productId === p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProductToOrder(p)}
                            disabled={p.stock === 0}
                            className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-secondary disabled:opacity-40"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.title}</span>
                              {p.stock === 0 && (
                                <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">Rupture</span>
                              )}
                              {alreadyAdded && (
                                <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">Ajouté</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Stock : {p.stock}</span>
                              {p.variants?.[0] && <span>dès {p.variants[0].price}€</span>}
                              <Plus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            </div>
                          </button>
                        )
                      })
                    }
                  </div>
                )}
              </div>
            </div>

            {/* Pied de page */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setProductsOpen(false)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveOrderProducts}
                disabled={savingProducts || orderItems.length === 0}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingProducts
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <RefreshCw className="h-4 w-4" aria-hidden="true" />
                }
                Mettre à jour la commande
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : numéro Colissimo / suivi transporteur */}
      {colissimoOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setColissimoOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Passer en livraison</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Saisis le numéro de suivi transporteur (Colissimo, Chronopost…). Il sera transmis au client dans la messagerie.
            </p>
            <input
              type="text"
              value={colissimoInput}
              onChange={(e) => setColissimoInput(e.target.value)}
              autoFocus
              placeholder="Ex. 1A23456789876"
              className="mt-4 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <p className="mt-2 text-xs text-muted-foreground">Optionnel — laisse vide si tu n&apos;as pas encore le numéro.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setColissimoOpen(false)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={confirmLivraison}
                disabled={isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Confirmer la livraison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
