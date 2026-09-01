"use client"

import { useState, useTransition, useEffect, useRef, useCallback, useMemo } from "react"
import useSWR from "swr"
import type { OrderThread, ThreadMessage, Product } from "@/lib/db/schema"
import { getActiveOrders, getLockerOrders, getDiscussions, getPastOrders, getThread, addMessage, updateThreadStatus, deleteOrderThread, sendXmrWallet, sendPaysafecardInstructions, confirmDeposit, updateOrderProducts, deleteMessage } from "@/app/actions/messaging"
import type { OrderProductItem, AdminOrderPromo } from "@/app/actions/messaging"
import { listProducts } from "@/app/actions/products"
import { listPromoCodes } from "@/app/actions/promo"
import { computePromoDiscount } from "@/lib/promo-calc"
import { Inbox, Send, Loader2, Truck, Store, Package, MessageSquare, Trash2, AlertTriangle, Wallet, CheckCircle2, Check, CheckCheck, Clock, ShoppingCart, Plus, Minus, RefreshCw, Paperclip, KeyRound, Unlock, Ticket, ExternalLink, Copy, Navigation } from "lucide-react"
import { VoiceNoteButton } from "@/components/voice-note-button"
import { grantRestoreAccess, getRestoreStatus } from "@/app/actions/restore-access"
import { VENDOR_STATUS_OPTIONS, VENDOR_DISCUSSION_STATUS_OPTIONS, STATUS_META, statusMeta, normalizeStatus } from "@/lib/order-status"
import { splitThreadForTracking, type OrderTrackingState } from "@/lib/order-timeline"
import { OrderTrackingCard } from "@/components/order-tracking-card"
import { MessageBody } from "@/components/message-body"
import { AdminCreateOrderModal } from "@/components/admin-create-order-modal"
import {
  formatMessageTime,
  formatThreadActivity,
  threadActivityAt,
  sortByActivityDesc,
} from "@/lib/format-time"

export function VendorInbox({
  initialThreads,
  mode = "orders",
  focusThreadId = null,
}: {
  initialThreads: OrderThread[]
  mode?: "orders" | "locker" | "messages" | "past"
  /** Deep-link admin : sélectionner ce fil au montage */
  focusThreadId?: number | null
}) {
  const [threads, setThreads] = useState(() => sortByActivityDesc(initialThreads))
  const [listLoading, setListLoading] = useState(initialThreads.length === 0)
  const [selectedId, setSelectedId] = useState<number | null>(
    focusThreadId && Number.isFinite(focusThreadId) ? focusThreadId : null,
  )
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [etaPreview, setEtaPreview] = useState<{ etaMin: number; driveMin: number } | null>(null)
  const [etaLoading, setEtaLoading] = useState(false)
  const [runCopied, setRunCopied] = useState(false)
  // Modale wallet XMR (locker validée)
  const [xmrModalOpen, setXmrModalOpen] = useState(false)
  const [xmrWalletInput, setXmrWalletInput] = useState("")
  const [xmrSending, setXmrSending] = useState(false)
  const [pscSending, setPscSending] = useState(false)
  const [pscError, setPscError] = useState<string | null>(null)
  // Suppression d'un message
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<number | null>(null)
  const [deletingMsgId, setDeletingMsgId] = useState<number | null>(null)
  // Rétablissement d'accès client
  const [restoring, setRestoring] = useState(false)
  const [restoreOk, setRestoreOk] = useState(false)
  type RestoreStatus = Awaited<ReturnType<typeof getRestoreStatus>>
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>(null)
  // Modale création de commande depuis messagerie
  const [createOrderOpen, setCreateOrderOpen] = useState(false)
  // Panneau gestion des articles
  const [productsOpen, setProductsOpen] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [orderItems, setOrderItems] = useState<OrderProductItem[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [savingProducts, setSavingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [productsError, setProductsError] = useState<string | null>(null)
  /** Frais livraison/locker préservés à l'ouverture du panneau */
  const [preservedFee, setPreservedFee] = useState(0)

  // Promo (modification commande — même modèle que création)
  const { data: existingPromos = [] } = useSWR(
    productsOpen ? "admin-promos-edit-order" : null,
    listPromoCodes,
  )
  const [promoEnabled, setPromoEnabled] = useState(false)
  const [promoSource, setPromoSource] = useState<"custom" | "existing">("custom")
  const [promoCodeId, setPromoCodeId] = useState<number | "">("")
  const [promoType, setPromoType] = useState<"fixed" | "percent" | "produit">("fixed")
  const [promoValue, setPromoValue] = useState(10)
  const [promoMinAmount, setPromoMinAmount] = useState(0)
  const [promoProductName, setPromoProductName] = useState("")
  const [promoCodeLabel, setPromoCodeLabel] = useState("ADMIN")

  const selected = threads.find((t) => t.id === selectedId) ?? null

  // Deep-link prop (query ?thread=) → ouvre le fil et charge les messages
  useEffect(() => {
    if (focusThreadId && Number.isFinite(focusThreadId) && focusThreadId > 0) {
      void openThread(focusThreadId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusThreadId])

  // Ouvre un fil ciblé (ex. depuis onglet Récupérations)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("bb33_admin_open_thread")
      if (!raw) return
      const id = Number(raw)
      sessionStorage.removeItem("bb33_admin_open_thread")
      if (!Number.isFinite(id) || id <= 0) return
      setSelectedId(id)
    } catch {
      /* ignore */
    }
  }, [])

  // Ouvre le panneau et pré-charge les articles existants de la commande
  const openProductsPanel = useCallback(async () => {
    if (!selected) return
    setProductsOpen(true)
    setLoadingProducts(true)

    // Charge le catalogue si pas encore fait
    let prods = allProducts
    if (prods.length === 0) {
      prods = await listProducts()
      setAllProducts(prods)
    }
    setLoadingProducts(false)

    // Extrait d'abord les prix réels depuis le summary (source de vérité).
    // Format summary : "• 1x Titre — 30€" ou "• 1x Titre ×5 — 150€"
    const summaryPrices: Record<string, number> = {}
    if (selected.summary) {
      for (const line of selected.summary.split("\n")) {
        // Capture : titre (avec variante optionnelle) et prix ligne
        const m = line.match(/^•\s+\d+x\s+(.+?)\s*(?:[×x]\d+)?\s*—\s*(\d+)€/)
        if (m) summaryPrices[m[1].trim().toLowerCase()] = parseInt(m[2], 10)
      }
    }

    // Parse le champ products pour les noms et quantités
    // Formats possibles : "1x Titre" ou "1x Titre ×5" ou "Titre ×1"
    const parsed: OrderProductItem[] = []
    if (selected.products) {
      const segments = selected.products.split(",").map((s) => s.trim())
      for (const seg of segments) {
        // Formats : "1x Titre ×5", "1x Titre", "Titre ×1"
        let titleRaw = ""
        let qty = 1
        const withCount = seg.match(/^(\d+)x\s+(.+)$/)
        if (withCount) {
          qty = parseInt(withCount[1], 10)
          titleRaw = withCount[2].replace(/\s*[×x]\d+$/, "").trim()
        } else {
          const withX = seg.match(/^(.+?)\s*[×x]\s*(\d+)$/i)
          if (withX) { titleRaw = withX[1].trim(); qty = parseInt(withX[2], 10) }
          else titleRaw = seg
        }

        const prod = prods.find((p) => p.title.toLowerCase() === titleRaw.toLowerCase())

        // Prix : summary en priorité, sinon variante catalogue correspondante, sinon première variante
        const summaryPrice = summaryPrices[titleRaw.toLowerCase()]
        const catalogPrice = prod
          ? (prod.variants?.find((v) => v.qty === qty)?.price ?? prod.variants?.[0]?.price ?? 0)
          : 0
        const price = summaryPrice !== undefined
          ? Math.round(summaryPrice / qty)   // prix unitaire = total ligne / qty
          : catalogPrice

        if (prod) {
          parsed.push({ productId: prod.id, title: prod.title, qty, price, prevQty: qty })
        } else {
          parsed.push({ productId: -1, title: titleRaw, qty, price, prevQty: qty })
        }
      }
    }

    setOrderItems(parsed)
    setProductSearch("")
    setProductsError(null)
    setPromoEnabled(false)
    setPromoSource("custom")
    setPromoCodeId("")
    setPromoType("fixed")
    setPromoValue(10)
    setPromoMinAmount(0)
    setPromoProductName("")
    setPromoCodeLabel("ADMIN")

    // Préserve les frais (livraison/locker) : total actuel − sous-total articles (approx)
    const itemsSum = parsed.reduce((s, i) => s + i.qty * i.price, 0)
    if (selected.fulfillment === "locker") {
      setPreservedFee(10)
    } else if (selected.fulfillment === "meetup") {
      setPreservedFee(0)
    } else {
      setPreservedFee(Math.max(0, Math.round(selected.total - itemsSum)))
    }
  }, [selected, allProducts])

  // Garde une référence à la commande ouverte pour le rafraîchissement périodique
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  const activePromos = useMemo(
    () => (existingPromos ?? []).filter((p) => p.active),
    [existingPromos],
  )

  const editPromoDraft: AdminOrderPromo | null = useMemo(() => {
    if (!promoEnabled) return null
    if (promoSource === "existing" && promoCodeId !== "") {
      const c = activePromos.find((p) => p.id === promoCodeId)
      if (!c) return null
      return {
        code: c.code,
        type: c.type as "percent" | "fixed" | "produit",
        value: c.value,
        minAmount: c.minAmount ?? 0,
        productName: c.productName,
      }
    }
    return {
      code: promoCodeLabel.trim().toUpperCase() || "ADMIN",
      type: promoType,
      value: promoValue,
      minAmount: promoMinAmount,
      productName: promoType === "produit" ? promoProductName : null,
    }
  }, [
    promoEnabled,
    promoSource,
    promoCodeId,
    activePromos,
    promoCodeLabel,
    promoType,
    promoValue,
    promoMinAmount,
    promoProductName,
  ])

  const orderSubtotal = useMemo(
    () => orderItems.filter((i) => i.qty > 0).reduce((sum, i) => sum + i.qty * i.price, 0),
    [orderItems],
  )
  const orderPromoDiscount = useMemo(
    () => computePromoDiscount(
      orderItems.filter((i) => i.qty > 0),
      orderSubtotal,
      editPromoDraft,
    ),
    [orderItems, orderSubtotal, editPromoDraft],
  )
  const orderPromoBlocked =
    !!editPromoDraft && editPromoDraft.minAmount > 0 && orderSubtotal < editPromoDraft.minAmount
  const orderTotal = Math.max(
    0,
    orderSubtotal + preservedFee - (orderPromoBlocked ? 0 : orderPromoDiscount),
  )

  // Ajoute un produit (qty = 1 pack commandé, price = prix du conditionnement)
  const addProductToOrder = (prod: Product) => {
    const firstVariant = prod.variants?.[0]
    const price = firstVariant?.price ?? 0
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id)
      if (existing) {
        // Déjà dans la liste : on incrémente le nombre de packs de 1
        return prev.map((i) => i.productId === prod.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, {
        productId: prod.id,
        title: prod.title,
        qty: 1,               // 1 pack commandé, pas la taille du conditionnement
        price,
        prevQty: 0,
      }]
    })
    setProductSearch("")
  }

  const updateItemQty = (productId: number, qty: number) => {
    setOrderItems((prev) => prev.map((i) => i.productId === productId ? { ...i, qty: Math.max(0, qty) } : i))
  }

  // Changer de conditionnement : on garde le nombre de packs en cours, seul le prix change
  const updateItemVariant = (productId: number, variantQty: number, prod: Product) => {
    const variant = prod.variants?.find((v) => v.qty === variantQty)
    if (!variant) return
    setOrderItems((prev) => prev.map((i) =>
      i.productId === productId ? { ...i, price: variant.price } : i
    ))
  }

  const removeItemFromOrder = (productId: number) => {
    setOrderItems((prev) => prev.filter((i) => i.productId !== productId))
  }

  const saveOrderProducts = async () => {
    if (!selectedId) return
    if (promoEnabled && editPromoDraft) {
      if (editPromoDraft.type === "produit" && !editPromoDraft.productName?.trim()) {
        setProductsError("Indique le nom du produit offert.")
        return
      }
      if (orderPromoBlocked) {
        setProductsError(`Minimum d'achat non atteint (min. ${editPromoDraft.minAmount}€).`)
        return
      }
    }
    setSavingProducts(true)
    setProductsError(null)
    try {
      const result = await updateOrderProducts(selectedId, orderItems, {
        promo: promoEnabled ? editPromoDraft : null,
        deliveryFee: preservedFee,
      })
      if (result.ok) {
        const newProductsText = orderItems.filter(i => i.qty > 0).map(i => `${i.title} ×${i.qty}`).join(", ")
        setThreads((prev) => prev.map((t) =>
          t.id === selectedId
            ? { ...t, total: result.newTotal, products: newProductsText, summary: result.newSummary ?? t.summary }
            : t
        ))
        const data = await getThread(selectedId)
        setMessages(data?.messages ?? [])
        setProductsOpen(false)
      } else {
        setProductsError(("error" in result && result.error) ? String(result.error) : "Erreur lors de la mise à jour.")
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
  const refresh = useCallback(async (isFirst = false) => {
    try {
      if (isFirst) setListLoading(true)
      const latest =
        mode === "messages"
          ? await getDiscussions()
          : mode === "locker"
            ? await getLockerOrders()
            : mode === "past"
              ? await getPastOrders()
              : await getActiveOrders()
      setThreads(sortByActivityDesc(latest))
      const openId = selectedIdRef.current
      if (openId != null) {
        const data = await getThread(openId)
        setMessages(data?.messages ?? [])
      }
    } catch {
      // silencieux : on réessaiera au prochain tick
    } finally {
      if (isFirst) setListLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void refresh(true) // chargement immédiat a l'affichage de l'onglet
    const interval = setInterval(() => void refresh(false), 8000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(false)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const refreshAfterSend = async (threadId: number) => {
    const data = await getThread(threadId)
    setMessages(data?.messages ?? [])
    const now = data?.thread?.updatedAt ?? new Date().toISOString()
    setThreads((prev) =>
      sortByActivityDesc(
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                status: t.status === "nouveau" ? "en cours" : t.status,
                updatedAt: now as typeof t.updatedAt,
              }
            : t,
        ),
      ),
    )
  }

  const sendReply = () => {
    if (!reply.trim() || selectedId == null) return
    const body = reply.trim()

    setReply("")
    startTransition(async () => {
      await addMessage(selectedId, "vendeur", body)
      await refreshAfterSend(selectedId)
    })
  }

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || selectedId == null) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/messages/upload", { method: "POST", body: fd })
        if (!res.ok) throw new Error("Echec de l'envoi.")
        const { url, type } = (await res.json()) as { url: string; type: string }
        const tag =
          type === "video"
            ? `[video]${url}[/video]`
            : type === "audio"
              ? `[audio]${url}[/audio]`
              : `[image]${url}[/image]`
        await addMessage(selectedId, "vendeur", tag)
      }
      await refreshAfterSend(selectedId)
    } catch {
      // erreur silencieuse — on peut ajouter un toast plus tard
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleVoiceSent = async (body: string) => {
    if (selectedId == null) return
    await addMessage(selectedId, "vendeur", body)
    await refreshAfterSend(selectedId)
  }

  // Charge le statut de rétablissement dès qu'un fil de discussion est ouvert,
  // puis le rafraîchit toutes les 10s pour détecter ouverture/définition mdp en temps réel.
  useEffect(() => {
    const token = selected?.customerToken
    if (!token || mode !== "messages") { setRestoreStatus(null); return }
    let cancelled = false
    const fetch = () => getRestoreStatus(token).then(s => { if (!cancelled) setRestoreStatus(s) }).catch(() => {})
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedId, mode])

  const handleRestoreAccess = async () => {
    const token = selected?.customerToken
    if (!token || restoring) return
    setRestoring(true)
    setRestoreOk(false)
    try {
      const res = await grantRestoreAccess(token, window.location.origin, selectedId ?? undefined)
      if (res.ok) {
        setRestoreOk(true)
        // Recharge le statut immédiatement après envoi
        const status = await getRestoreStatus(token)
        setRestoreStatus(status)
        setTimeout(() => setRestoreOk(false), 4000)
      }
    } finally {
      setRestoring(false)
    }
  }

  const changeStatus = (status: string) => {
    if (selectedId == null) return
    // L'annulation passe par une modale pour saisir le motif communiqué au client.
    if (status === "annulee") {
      setCancelReason("")
      setCancelOpen(true)
      return
    }
    // Le passage en "livraison" ouvre une modale pour saisir le numéro Colissimo + aperçu ETA.
    if (status === "livraison") {
      setColissimoInput("")
      setEtaPreview(null)
      setColissimoOpen(true)
      // ETA via server action (GPS en base, sinon géocode adresse + persiste lat/lng)
      if (selectedId != null) {
        setEtaLoading(true)
        void (async () => {
          try {
            const { getDeliveryEtaForThread } = await import("@/app/actions/drive-eta")
            const eta = await getDeliveryEtaForThread(selectedId)
            if (eta) setEtaPreview({ etaMin: eta.etaMin, driveMin: eta.driveMin })
          } catch {
            /* ignore */
          } finally {
            setEtaLoading(false)
          }
        })()
      }
      return
    }
    // Locker validée → XMR wallet ou instructions Paysafecard
    const currentThread = threads.find((t) => t.id === selectedId)
    if (status === "validee" && currentThread?.fulfillment === "locker") {
      const method = (currentThread as { paymentMethod?: string | null }).paymentMethod
      if (method === "paysafecard" || method === "wiro") {
        // Envoi direct des instructions officielles (pas de modal identifiant)
        setPscError(null)
        setPscSending(true)
        startTransition(async () => {
          try {
            const res = await sendPaysafecardInstructions(selectedId)
            if (!res.ok) {
              setPscError(res.error ?? "Échec envoi instructions Paysafecard.")
              return
            }
            setThreads((prev) =>
              prev.map((t) =>
                t.id === selectedId
                  ? ({ ...t, status: "validee", paymentMethod: "paysafecard" } as typeof t)
                  : t,
              ),
            )
            const data = await getThread(selectedId)
            setMessages(data?.messages ?? [])
          } finally {
            setPscSending(false)
          }
        })
      } else {
        setXmrWalletInput("")
        setXmrModalOpen(true)
      }
      return
    }
    startTransition(async () => {
      await updateThreadStatus(selectedId, status)
      setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status } : t)))
      const data = await getThread(selectedId)
      if (data?.thread) {
        setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...data.thread } : t)))
      }
      setMessages(data?.messages ?? [])
    })
  }

  const confirmLivraison = () => {
    if (selectedId == null) return
    const colissimo = colissimoInput.trim()
    setColissimoOpen(false)
    startTransition(async () => {
      await updateThreadStatus(selectedId, "livraison", undefined, colissimo || undefined)
      const data = await getThread(selectedId)
      if (data?.thread) {
        setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...data.thread } : t)))
      } else {
        setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status: "livraison" } : t)))
      }
      setMessages(data?.messages ?? [])
    })
  }

  const confirmXmrWallet = async () => {
    if (selectedId == null || !xmrWalletInput.trim()) return
    setXmrSending(true)
    try {
      await sendXmrWallet(selectedId, xmrWalletInput.trim())
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedId
            ? ({ ...t, status: "validee", xmrWallet: xmrWalletInput.trim(), paymentMethod: "xmr" } as typeof t)
            : t,
        ),
      )
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
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedId ? { ...t, depositConfirmed: true, status: "preparation" } : t,
        ),
      )
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
      const data = await getThread(selectedId)
      if (data?.thread) {
        setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...data.thread } : t)))
      } else {
        setThreads((prev) => prev.map((t) => (t.id === selectedId ? { ...t, status: "annulee" } : t)))
      }
      setMessages(data?.messages ?? [])
    })
  }

  const copyRunLink = async () => {
    const token = (selected as { runToken?: string | null } | null)?.runToken
    if (!token || typeof window === "undefined") return
    const url = `${window.location.origin}/run/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setRunCopied(true)
      window.setTimeout(() => setRunCopied(false), 2000)
    } catch {
      /* ignore */
    }
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
          {listLoading && threads.length === 0 && (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Chargement…
            </div>
          )}
          {!listLoading && threads.length === 0 && (
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
                    <span className="flex min-w-0 items-center gap-2">
                      {/* Pastille rouge : nouvelle commande / discussion à traiter */}
                      {(t.status === "en_attente" ||
                        t.status === "nouveau" ||
                        t.status === "discussion") && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                          aria-label="À traiter"
                          title="À traiter"
                        />
                      )}
                      <span className="truncate text-sm font-medium">{t.customerName}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* File prioritaire Or / Platine */}
                      {mode === "messages" &&
                        typeof (t as { _priority?: number })._priority === "number" &&
                        ((t as { _priority?: number })._priority ?? 0) > 0 && (
                          <span
                            className="rounded-full border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-300"
                            title="Client prioritaire (Or / Platine)"
                          >
                            ★ Prio
                          </span>
                        )}
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
                    <span title="Dernier message">{formatThreadActivity(threadActivityAt(t))}</span>
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
            <div className="shrink-0 border-b border-border px-3 py-3 sm:px-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{selected.customerName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.fulfillment === "meetup"
                      ? "Retrait meet-up"
                      : selected.fulfillment === "locker"
                        ? "Locker Mondial Relay"
                        : "Livraison"}
                    {" · "}
                    {selected.fulfillment === "locker"
                      ? selected.scheduledDate ?? "Délai 3–5 jours ouvrés"
                      : selected.scheduledDate ?? "Date non renseignée"}
                    {selected.scheduledSlot ? ` · ${selected.scheduledSlot}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isPending || isDeleting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
                  aria-label="Supprimer la commande"
                  title="Supprimer la commande"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <label htmlFor="order-status" className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  État notifié au client
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusMeta(selected.status).badge}`}>
                    {statusMeta(selected.status).label}
                  </span>
                  <select
                    id="order-status"
                    value={normalizeStatus(selected.status) === "en_attente" ? "" : normalizeStatus(selected.status)}
                    onChange={(e) => e.target.value && changeStatus(e.target.value)}
                    disabled={isPending}
                    className="min-w-0 max-w-full flex-1 basis-[10rem] rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-accent disabled:opacity-50 sm:flex-none"
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
                  {mode === "messages" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCreateOrderOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                        title="Créer une commande pour ce client"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                        Créer commande
                      </button>
                      <button
                        type="button"
                        onClick={handleRestoreAccess}
                        disabled={restoring || restoreOk}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          restoreOk
                            ? "border-green-500/40 bg-green-500/10 text-green-400"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                        }`}
                        title="Envoyer une notification de rétablissement d'accès au client"
                      >
                        {restoring
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : restoreOk
                          ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                        }
                        {restoreOk ? "Notification envoyée" : "Rétablir l'accès"}
                      </button>
                    </>
                  )}
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
                </div>
              </div>
            </div>

            {mode !== "messages" &&
              (normalizeStatus(selected.status) === "livraison" ||
                normalizeStatus(selected.status) === "arrivee") &&
              (selected as { runToken?: string | null }).runToken && (
                <div className="flex flex-wrap items-center gap-2 border-b border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5">
                  <Navigation className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-xs text-cyan-100">
                    Mode tournée — ouvre le lien, puis « Ajouter à l&apos;écran d&apos;accueil ».
                  </p>
                  <a
                    href="/run"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/15"
                  >
                    Feuille
                  </a>
                  <a
                    href={`/run/${(selected as { runToken?: string }).runToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/15"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    Ouvrir
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyRunLink()}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/15"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    {runCopied ? "Copié" : "Copier"}
                  </button>
                </div>
              )}

            {/* Bandeau statut rétablissement d'accès */}
            {mode === "messages" && restoreStatus && !restoreStatus.done && (
              <div className={`flex items-center gap-2.5 border-b px-4 py-2.5 text-xs ${
                restoreStatus.expired
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : restoreStatus.mustSetPassword && !restoreStatus.pending
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-400"
              }`}>
                {restoreStatus.expired ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Le lien de retablissement a <strong>expire</strong> — le client ne l&apos;a pas ouvert dans les 24h. Renvoie un nouveau lien.</span>
                  </>
                ) : restoreStatus.mustSetPassword && !restoreStatus.pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    <span>Le client a <strong>ouvert le lien</strong> et est en train de definir son mot de passe.</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Lien de retablissement <strong>envoye</strong> — en attente d&apos;ouverture par le client{restoreStatus.expiresAt ? ` (expire ${new Date(restoreStatus.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})` : ""}.</span>
                  </>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : (
                (() => {
                  const { recap, rest } = splitThreadForTracking(messages)
                  const renderBubble = (m: (typeof messages)[number]) => {
                  const isVendeur = m.sender === "vendeur"
                  const readAt = (m as any).clientReadAt as string | null | undefined
                  const isConfirming = confirmDeleteMsgId === m.id
                  const isDeleting = deletingMsgId === m.id

                  const handleDelete = async () => {
                    setDeletingMsgId(m.id)
                    await deleteMessage(m.id)
                    setMessages((prev) => prev.filter((x) => x.id !== m.id))
                    setConfirmDeleteMsgId(null)
                    setDeletingMsgId(null)
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isVendeur ? "items-end" : "items-start"}`}
                    >
                      {/* Bulle */}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm transition-opacity ${
                          isDeleting ? "opacity-40" : ""
                        } ${
                          isVendeur
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <MessageBody body={m.body} />
                      </div>

                      {/* Méta — expéditeur, date, lu/non-lu + poubelle (mes messages uniquement) */}
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {isVendeur ? "Vous" : selected.customerName} · {formatMessageTime(m.createdAt)}
                        {isVendeur && (
                          readAt
                            ? <span title={`Lu le ${formatMessageTime(readAt)}`} className="flex items-center gap-0.5 text-accent">
                                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                                <span>Lu</span>
                              </span>
                            : <span title="Non lu" className="flex items-center gap-0.5 text-muted-foreground/60">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                <span>Non lu</span>
                              </span>
                        )}
                        {isVendeur && !isConfirming && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMsgId(m.id)}
                            disabled={isDeleting}
                            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-destructive disabled:pointer-events-none"
                            aria-label="Supprimer ce message"
                            title="Supprimer"
                          >
                            {isDeleting
                              ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              : <Trash2 className="h-3 w-3" aria-hidden="true" />
                            }
                          </button>
                        )}
                        {isVendeur && isConfirming && (
                          <>
                            <span className="text-destructive/70">Supprimer ?</span>
                            <button
                              type="button"
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="font-medium text-destructive transition-colors hover:text-destructive/70 disabled:opacity-50"
                              aria-label="Confirmer"
                            >
                              Oui
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMsgId(null)}
                              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                              aria-label="Annuler"
                            >
                              Non
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  )
                  }
                  return (
                    <>
                      {recap && renderBubble(recap)}
                      {mode !== "messages" && (
                        <OrderTrackingCard
                          orderId={selected.id}
                          status={selected.status}
                          fulfillment={selected.fulfillment}
                          tracking={(selected as { tracking?: OrderTrackingState }).tracking}
                          createdAt={selected.createdAt}
                          scheduledSlot={selected.scheduledSlot}
                          colissimoNumber={selected.colissimoNumber}
                        />
                      )}
                      {rest.map(renderBubble)}
                    </>
                  )
                })()
              )}
            </div>

            {pscError && selected?.fulfillment === "locker" && (
              <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {pscError}
              </div>
            )}
            {pscSending && selected?.fulfillment === "locker" && (
              <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Envoi instructions Paysafecard…
              </div>
            )}
            {/* Bandeau dépôt (XMR / Paysafecard) notifié — bouton confirmer → envoie token TRK */}
            {selected.fulfillment === "locker" && (selected as any).depositNotified && !(selected as any).depositConfirmed && (
              <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-amber-400">
                    {(selected as any).paymentMethod === "paysafecard" || (selected as any).paymentMethod === "wiro"
                      ? "Code Paysafecard signalé par le client"
                      : "Dépôt XMR signalé par le client"}
                  </p>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {(selected as any).paymentMethod === "paysafecard" || (selected as any).paymentMethod === "wiro"
                    ? "Vérifie le PIN à 16 chiffres dans le fil avant de confirmer. Le token TRK_ sera envoyé en messagerie."
                    : "Vérifie la réception sur ton wallet Monero avant de confirmer. Le token TRK_ sera envoyé en messagerie au client."}
                </p>
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
                  disabled={uploading || isPending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  aria-label="Joindre une photo, video ou audio"
                  title="Joindre une photo, video ou audio"
                >
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Paperclip className="h-4 w-4" aria-hidden="true" />
                  }
                </button>
                <VoiceNoteButton
                  size="sm"
                  disabled={uploading || isPending}
                  onSent={handleVoiceSent}
                />
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
              Saisis l&apos;adresse du wallet Monero sur lequel le client devra effectuer son dépôt. Elle lui sera transmise dans son suivi locker. Le token TRK_ partira après ta confirmation de réception.
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
              Indique le motif de l&apos;annulation. Il s&apos;affiche sur le suivi et part en notification — pas dans le fil.
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
      {/* Modale : créer une commande depuis messagerie */}
      {createOrderOpen && selected && (
        <AdminCreateOrderModal
          customerName={selected.customerName}
          customerToken={selected.customerToken ?? null}
          onClose={() => setCreateOrderOpen(false)}
          onCreated={(orderId) => {
            // Rafraîchit la liste après création
            refresh()
            setCreateOrderOpen(false)
          }}
        />
      )}

      {/* Panneau : gestion des articles de la commande */}
      {productsOpen && selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:p-4 md:items-center"
          onClick={() => setProductsOpen(false)}
        >
          <div
            className="flex h-[min(92dvh,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <ShoppingCart className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">Gérer les articles — Commande #{selected.id}</h3>
                <p className="text-xs text-muted-foreground">{selected.customerName} · Total actuel : {selected.total}€</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Nouveau total</p>
                <p className="text-base font-bold text-foreground">{orderTotal}€</p>
                {promoEnabled && orderPromoDiscount > 0 && !orderPromoBlocked && (
                  <p className="text-[10px] text-accent">−{orderPromoDiscount}€ promo</p>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
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
                            value={item.price}
                            onChange={(e) => {
                              // Retrouve la variante par son prix et passe le qty du conditionnement
                              const chosen = prod.variants?.find((v) => v.price === Number(e.target.value))
                              if (chosen) updateItemVariant(item.productId, chosen.qty, prod)
                            }}
                            className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                          >
                            {prod.variants.map((v) => (
                              <option key={v.qty} value={v.price}>{v.qty} × {v.price}€</option>
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
                            className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-secondary"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.title}</span>
                              {p.stock === 0 && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">Hors stock</span>
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

              {/* Promotion — même modèle que création commande */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                    Promotion
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={promoEnabled}
                      onChange={(e) => setPromoEnabled(e.target.checked)}
                      className="rounded border-border"
                    />
                    Appliquer une promo
                  </label>
                </div>

                {promoEnabled && (
                  <div className="space-y-3 rounded-xl border border-border bg-background p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPromoSource("custom")}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                          promoSource === "custom"
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        Personnalisée
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoSource("existing")}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                          promoSource === "existing"
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        Code existant
                      </button>
                    </div>

                    {promoSource === "existing" ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Code promo actif</label>
                        <select
                          value={promoCodeId === "" ? "" : String(promoCodeId)}
                          onChange={(e) =>
                            setPromoCodeId(e.target.value ? Number(e.target.value) : "")
                          }
                          className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                        >
                          <option value="">Choisir un code…</option>
                          {activePromos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} —{" "}
                              {c.type === "percent"
                                ? `-${c.value}%`
                                : c.type === "produit"
                                  ? `${c.value}× ${c.productName ?? "produit"}`
                                  : `-${c.value}€`}
                              {c.minAmount > 0 ? ` · min ${c.minAmount}€` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                          <label className="text-xs font-medium text-muted-foreground">Libellé code</label>
                          <input
                            type="text"
                            value={promoCodeLabel}
                            onChange={(e) => setPromoCodeLabel(e.target.value.toUpperCase())}
                            placeholder="ADMIN"
                            className="rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                          />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                          <label className="text-xs font-medium text-muted-foreground">Type</label>
                          <select
                            value={promoType}
                            onChange={(e) =>
                              setPromoType(e.target.value as "fixed" | "percent" | "produit")
                            }
                            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                          >
                            <option value="fixed">Montant €</option>
                            <option value="percent">Pourcentage %</option>
                            <option value="produit">Produit offert</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Valeur ({promoType === "percent" ? "%" : promoType === "produit" ? "nb offert" : "€"})
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={promoValue}
                            onChange={(e) => setPromoValue(Number(e.target.value) || 0)}
                            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Minimum d&apos;achat (€)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={promoMinAmount}
                            onChange={(e) => setPromoMinAmount(Number(e.target.value) || 0)}
                            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                          />
                        </div>
                        {promoType === "produit" && (
                          <div className="col-span-2 flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              Nom du produit offert
                            </label>
                            <input
                              type="text"
                              value={promoProductName}
                              onChange={(e) => setPromoProductName(e.target.value)}
                              placeholder="Doit correspondre à un article de la commande"
                              list="edit-order-product-names"
                              className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                            />
                            <datalist id="edit-order-product-names">
                              {orderItems
                                .filter((i) => i.qty > 0)
                                .map((i) => (
                                  <option key={i.productId} value={i.title} />
                                ))}
                            </datalist>
                          </div>
                        )}
                      </div>
                    )}

                    {orderPromoBlocked && (
                      <p className="text-xs text-amber-400">
                        Min. d&apos;achat {editPromoDraft?.minAmount}€ non atteint (panier {orderSubtotal}€).
                      </p>
                    )}
                    {!orderPromoBlocked && orderPromoDiscount > 0 && (
                      <p className="text-xs text-accent">Remise calculée : −{orderPromoDiscount}€</p>
                    )}
                  </div>
                )}
              </div>

              {(preservedFee > 0 || orderSubtotal > 0) && (
                <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <p>Sous-total : <span className="font-medium text-foreground">{orderSubtotal}€</span></p>
                  {preservedFee > 0 && (
                    <p>
                      {selected?.fulfillment === "locker" ? "Locker" : "Livraison"} :{" "}
                      <span className="font-medium text-foreground">{preservedFee}€</span>
                    </p>
                  )}
                  {promoEnabled && orderPromoDiscount > 0 && !orderPromoBlocked && (
                    <p className="text-accent">Promo : −{orderPromoDiscount}€</p>
                  )}
                  <p className="pt-0.5 font-semibold text-foreground">Total : {orderTotal}€</p>
                </div>
              )}
            </div>

            {/* Pied de page */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4">
              {productsError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {productsError}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
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
                  disabled={savingProducts || orderItems.filter((i) => i.qty > 0).length === 0}
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
              Saisis le numéro de suivi transporteur (optionnel). Il s&apos;affiche sur le suivi graphique — plus de message auto dans le fil.
            </p>

            {/* Aperçu ETA (carte / OSRM + 3 min) — persisté sur le suivi */}
            {(etaLoading || etaPreview) && (
              <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm">
                {etaLoading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Calcul du temps de trajet…
                  </p>
                ) : etaPreview ? (
                  <p className="text-foreground">
                    <span className="font-semibold text-accent">⏱ ETA client : ~{etaPreview.etaMin} min</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Trajet ~{Math.round(etaPreview.driveMin)} min + 3 min de marge.
                      Calculé en interne et affiché sur le suivi client.
                      En multi-arrêt, mets à jour le point de départ sur la carte avant de confirmer.
                    </span>
                  </p>
                ) : null}
              </div>
            )}
            {!etaLoading && !etaPreview && selected?.fulfillment === "livraison" && (
              <p className="mt-3 text-xs text-amber-400/90">
                Impossible de calculer l&apos;ETA (adresse manquante ou géocode en échec).
                Pas d&apos;ETA (adresse manquante ou géocode en échec). Vérifie l&apos;adresse de la commande.
              </p>
            )}

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
