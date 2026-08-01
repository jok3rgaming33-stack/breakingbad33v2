"use client"

import { useEffect } from "react"
import { setAppBadgeCount } from "@/lib/app-badge"
import { useNotifications } from "@/components/notifications-provider"

/**
 * Synchronise le badge d'icône PWA avec les non-lus menu + cloche.
 * Doit être monté sous NotificationsProvider (clients).
 */
export function AppBadgeSync({
  menuUnread = 0,
  enabled = true,
}: {
  menuUnread?: number
  enabled?: boolean
}) {
  const { unreadCount } = useNotifications()

  useEffect(() => {
    if (!enabled) return
    const total = Math.max(0, (menuUnread || 0) + (unreadCount || 0))
    void setAppBadgeCount(total)
  }, [enabled, menuUnread, unreadCount])

  // Rafraîchit le badge quand l'app revient au premier plan
  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const total = Math.max(0, (menuUnread || 0) + (unreadCount || 0))
        void setAppBadgeCount(total)
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [enabled, menuUnread, unreadCount])

  return null
}

/** Badge admin (pas de cloche client). */
export function AdminAppBadgeSync({ total, enabled = true }: { total: number; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return
    void setAppBadgeCount(total)
  }, [enabled, total])

  useEffect(() => {
    if (!enabled) return
    const onVis = () => {
      if (document.visibilityState === "visible") void setAppBadgeCount(total)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [enabled, total])

  return null
}
