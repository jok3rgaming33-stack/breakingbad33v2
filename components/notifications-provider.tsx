"use client"

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react"
import { getCustomerThreadsOverview } from "@/app/actions/messaging"
import { normalizeStatus, statusMeta, type OrderStatusKey } from "@/lib/order-status"
import { sectionForThreadStatus, type ClientOpenSection } from "@/lib/deep-links"

export type OrderNotification = {
  id: string
  threadId: number
  kind: "status" | "message" | "broadcast" | "trk"
  status: OrderStatusKey
  rawStatus: string
  label: string
  createdAt: number
  read: boolean
  /** Où ouvrir au clic */
  openTarget: ClientOpenSection
}

type SeenEntry = { status: string; vendor: number }

type NotificationsContextValue = {
  notifications: OrderNotification[]
  unreadCount: number
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

const POLL_MS = 12000

function seenKey(pseudo: string) {
  return `notif:${pseudo}:seen3`
}
function listKey(pseudo: string) {
  return `notif:${pseudo}:list3`
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

function labelFor(status: string, kind: OrderNotification["kind"]): string {
  if (kind === "broadcast") return "Nouvelle notification"
  if (kind === "trk") return "Token de suivi Locker — à sauvegarder"
  if (kind === "message") return "Nouveau message du vendeur"
  return statusMeta(normalizeStatus(status)).label
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
      const rawStatus = t.status || "en_attente"
      const current = normalizeStatus(rawStatus)
      const vendor = t.vendorCount ?? 0
      const previous = seen[t.id]
      const openTarget = sectionForThreadStatus(rawStatus)

      if (previous === undefined) {
        // Première observation
        seen[t.id] = { status: rawStatus, vendor }
        // Broadcast admin / TRK : notifier immédiatement (sinon jamais de pastille)
        if (rawStatus === "notification" && vendor > 0) {
          fresh.push({
            id: `${t.id}-broadcast-${Date.now()}`,
            threadId: t.id,
            kind: "broadcast",
            status: current,
            rawStatus,
            label: labelFor(rawStatus, "broadcast"),
            createdAt: Date.now(),
            read: false,
            openTarget: "messaging",
          })
        } else if (rawStatus === "trk_token") {
          fresh.push({
            id: `${t.id}-trk-${Date.now()}`,
            threadId: t.id,
            kind: "trk",
            status: current,
            rawStatus,
            label: labelFor(rawStatus, "trk"),
            createdAt: Date.now(),
            read: false,
            openTarget: "orders",
          })
        }
        continue
      }

      if (previous.status !== rawStatus) {
        fresh.push({
          id: `${t.id}-status-${rawStatus}-${Date.now()}`,
          threadId: t.id,
          kind: rawStatus === "notification" ? "broadcast" : "status",
          status: current,
          rawStatus,
          label:
            rawStatus === "notification"
              ? labelFor(rawStatus, "broadcast")
              : statusMeta(current).label,
          createdAt: Date.now(),
          read: false,
          openTarget,
        })
      }
      if (vendor > previous.vendor) {
        fresh.push({
          id: `${t.id}-msg-${vendor}-${Date.now()}`,
          threadId: t.id,
          kind: rawStatus === "notification" ? "broadcast" : "message",
          status: current,
          rawStatus,
          label:
            rawStatus === "notification"
              ? labelFor(rawStatus, "broadcast")
              : labelFor(rawStatus, "message"),
          createdAt: Date.now(),
          read: false,
          openTarget,
        })
      }
      seen[t.id] = { status: rawStatus, vendor }
    }

    if (fresh.length > 0) {
      setNotifications((prev) => {
        const next = [...fresh, ...prev].slice(0, 40)
        if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify(next))
        return next
      })
    }
    if (pseudo) localStorage.setItem(seenKey(pseudo), JSON.stringify(seen))
  }, [pseudo, token])

  useEffect(() => {
    if (!enabled || !pseudo || !token) return
    poll()
    const interval = setInterval(poll, POLL_MS)
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

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify(next))
        return next
      })
    },
    [pseudo],
  )

  const clearAll = useCallback(() => {
    setNotifications([])
    if (pseudo) localStorage.setItem(listKey(pseudo), JSON.stringify([]))
  }, [pseudo])

  const unreadCount = notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0)

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, markAllRead, markRead, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    return {
      notifications: [] as OrderNotification[],
      unreadCount: 0,
      markAllRead: () => {},
      markRead: (_id: string) => {},
      clearAll: () => {},
    }
  }
  return ctx
}
