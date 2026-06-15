"use client"

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react"
import { getThreadsForCustomer } from "@/app/actions/messaging"
import { normalizeStatus, statusMeta, type OrderStatusKey } from "@/lib/order-status"

export type OrderNotification = {
  id: string
  threadId: number
  status: OrderStatusKey
  label: string
  createdAt: number
  read: boolean
}

type NotificationsContextValue = {
  notifications: OrderNotification[]
  unreadCount: number
  markAllRead: () => void
  clearAll: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

const POLL_MS = 15000

function seenKey(pseudo: string) {
  return `notif:${pseudo}:seen`
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
  enabled = true,
  children,
}: {
  pseudo?: string
  enabled?: boolean
  children: React.ReactNode
}) {
  const [notifications, setNotifications] = useState<OrderNotification[]>([])
  const seenRef = useRef<Record<number, OrderStatusKey>>({})

  // Charge l'état persisté quand le pseudo devient disponible
  useEffect(() => {
    if (!pseudo) {
      setNotifications([])
      seenRef.current = {}
      return
    }
    seenRef.current = readJSON<Record<number, OrderStatusKey>>(seenKey(pseudo), {})
    setNotifications(readJSON<OrderNotification[]>(listKey(pseudo), []))
  }, [pseudo])

  const poll = useCallback(async () => {
    if (!pseudo) return
    let threads: Array<{ id: number; status: string }> = []
    try {
      threads = (await getThreadsForCustomer(pseudo)) as Array<{ id: number; status: string }>
    } catch {
      return
    }

    const seen = seenRef.current
    const fresh: OrderNotification[] = []

    for (const t of threads) {
      const current = normalizeStatus(t.status)
      const previous = seen[t.id]
      if (previous === undefined) {
        // Première observation de cette commande : on enregistre sans notifier (pas de spam)
        seen[t.id] = current
      } else if (previous !== current) {
        // Le statut a changé depuis la dernière visite → notification
        fresh.push({
          id: `${t.id}-${current}-${Date.now()}`,
          threadId: t.id,
          status: current,
          label: statusMeta(current).label,
          createdAt: Date.now(),
          read: false,
        })
        seen[t.id] = current
      }
    }

    if (fresh.length > 0) {
      setNotifications((prev) => {
        const next = [...fresh, ...prev].slice(0, 30)
        if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify(next))
        return next
      })
    }
    if (pseudo) localStorage.setItem(seenKey(pseudo), JSON.stringify(seen))
  }, [pseudo])

  // Sondage périodique
  useEffect(() => {
    if (!enabled || !pseudo) return
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
  }, [enabled, pseudo, poll])

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
