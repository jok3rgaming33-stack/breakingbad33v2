"use client"

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react"
import { getCustomerThreadsOverview } from "@/app/actions/messaging"
import { normalizeStatus, statusMeta, type OrderStatusKey } from "@/lib/order-status"

export type OrderNotification = {
  id: string
  threadId: number
  kind: "status" | "message"
  status: OrderStatusKey
  label: string
  createdAt: number
  read: boolean
}

type SeenEntry = { status: OrderStatusKey; vendor: number }

type NotificationsContextValue = {
  notifications: OrderNotification[]
  unreadCount: number
  markAllRead: () => void
  clearAll: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

const POLL_MS = 15000

function seenKey(pseudo: string) {
  // v2 : suit désormais { statut, nb messages vendeur } par commande
  return `notif:${pseudo}:seen2`
}
function listKey(pseudo: string) {
  return `notif:${pseudo}:list`
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function NotificationsProvider({
  pseudo,
  token,
  enabled = true,
  children,
}: {
  pseudo?: string
  token?: string
  enabled?: boolean
  children: React.ReactNode
}) {
  const [notifications, setNotifications] = useState<OrderNotification[]>([])
  const seenRef = useRef<Record<number, SeenEntry>>({})

  // Charge l'état persisté quand le pseudo devient disponible
  useEffect(() => {
    if (!pseudo) {
      setNotifications([])
      seenRef.current = {}
      return
    }
    seenRef.current = readJSON<Record<number, SeenEntry>>(seenKey(pseudo), {})
    setNotifications(readJSON<OrderNotification[]>(listKey(pseudo), []))
  }, [pseudo])

  const poll = useCallback(async () => {
    if (!pseudo || !token) return
    let threads: Array<{ id: number; status: string; vendorCount: number }> = []
    try {
      threads = (await getCustomerThreadsOverview(token)) as Array<{
        id: number
        status: string
        vendorCount: number
      }>
    } catch {
      return
    }

    const seen = seenRef.current
    const fresh: OrderNotification[] = []

    for (const t of threads) {
      const current = normalizeStatus(t.status)
      const vendor = t.vendorCount ?? 0
      const previous = seen[t.id]
      if (previous === undefined) {
        // Première observation de cette commande : on enregistre sans notifier (pas de spam)
        seen[t.id] = { status: current, vendor }
        continue
      }
      // Changement de statut → notification
      if (previous.status !== current) {
        fresh.push({
          id: `${t.id}-status-${current}-${Date.now()}`,
          threadId: t.id,
          kind: "status",
          status: current,
          label: statusMeta(current).label,
          createdAt: Date.now(),
          read: false,
        })
      }
      // Nouveau(x) message(s) du vendeur → notification
      if (vendor > previous.vendor) {
        fresh.push({
          id: `${t.id}-msg-${vendor}-${Date.now()}`,
          threadId: t.id,
          kind: "message",
          status: current,
          label: "Nouveau message du vendeur",
          createdAt: Date.now(),
          read: false,
        })
      }
      seen[t.id] = { status: current, vendor }
    }

    if (fresh.length > 0) {
      setNotifications((prev) => {
        const next = [...fresh, ...prev].slice(0, 30)
        if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify(next))
        return next
      })
    }
    if (pseudo) localStorage.setItem(seenKey(pseudo), JSON.stringify(seen))
  }, [pseudo, token])

  // Sondage périodique
  useEffect(() => {
    if (!enabled || !pseudo || !token) return
    poll()
    const interval = setInterval(poll, POLL_MS)
    // Re-sonde quand l'onglet reprend le focus
    const onVisible = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, pseudo, token, poll])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }))
      if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify(next))
      return next
    })
  }, [pseudo])

  const clearAll = useCallback(() => {
    setNotifications([])
    if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify([]))
  }, [pseudo])

  const unreadCount = notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0)

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    // Fallback neutre si le provider est absent (ex. admin)
    return { notifications: [], unreadCount: 0, markAllRead: () => {}, clearAll: () => {} }
  }
  return ctx
}
