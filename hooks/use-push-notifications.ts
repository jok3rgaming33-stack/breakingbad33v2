"use client"

import { useCallback, useEffect, useState } from "react"
import { savePushSubscription, removePushSubscription } from "@/app/actions/push"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export type PushStatus = "unsupported" | "default" | "denied" | "granted"

type Options = {
  role: "client" | "vendeur"
  customerToken?: string | null
}

export function usePushNotifications({ role, customerToken }: Options) {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<PushStatus>("default")
  const [busy, setBusy] = useState(false)

  // Détecte le support et l'état d'abonnement courant au montage.
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!VAPID_PUBLIC_KEY
    setSupported(ok)
    if (!ok) {
      setPermission("unsupported")
      return
    }
    setPermission(Notification.permission as PushStatus)

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {})
  }, [])

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return false
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm as PushStatus)
      if (perm !== "granted") return false

      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        role,
        customerToken: customerToken ?? null,
      })
      setSubscribed(true)
      return true
    } catch (e) {
      console.log("[v0] subscribe error:", e)
      return false
    } finally {
      setBusy(false)
    }
  }, [supported, role, customerToken])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      console.log("[v0] unsubscribe error:", e)
    } finally {
      setBusy(false)
    }
  }, [supported])

  return { supported, subscribed, permission, busy, subscribe, unsubscribe }
}
