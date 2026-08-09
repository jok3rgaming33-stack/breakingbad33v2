"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
  // Mémorise la dernière combinaison (endpoint + rôle + token) déjà synchronisée
  // en base, pour éviter de réécrire à chaque appel inutilement.
  const syncedRef = useRef<string | null>(null)

  // Resynchronise silencieusement l'abonnement navigateur existant avec la base,
  // SANS redemander la permission. Corrige le cas où le customerToken a changé
  // (reconnexion, régénération de clé) ou où la ligne push_subscriptions a été
  // supprimée côté serveur, alors que le navigateur reste abonné : sans ce
  // rattrapage, les push partaient dans le vide jusqu'à ce que le client
  // re-clique sur "Activer les notifications" — d'où l'impression de ne
  // recevoir les notifications qu'en rouvrant l'app/le site.
  const resync = useCallback(async () => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return
    if (!VAPID_PUBLIC_KEY) return
    if (Notification.permission !== "granted") return
    try {
      // Best-effort : pas de timeout dur ici, ça ne bloque aucun rendu (appel
      // silencieux, pas sur le chemin de montage critique Safari/PWA).
      const reg = await navigator.serviceWorker.register("/sw.js")
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

      const syncKey = `${json.endpoint}|${role}|${customerToken ?? ""}`
      if (syncedRef.current === syncKey) return

      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        role,
        customerToken: customerToken ?? null,
      })
      syncedRef.current = syncKey
    } catch (e) {
      console.log("[v0] push resync error:", e)
    }
  }, [role, customerToken])

  // Détecte le support et l'état d'abonnement courant au montage.
  // Important mobile : ne PAS await serviceWorker.ready ici (peut pendre sous Safari/PWA).
  // On enregistre le SW en fire-and-forget uniquement pour lire l'abonnement existant.
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

    let cancelled = false
    const t = window.setTimeout(() => {
      // Timeout soft : si le SW ne répond pas (Safari mobile), on n'bloque rien
      if (!cancelled) setSubscribed(false)
    }, 2500)

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub)
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false)
      })
      .finally(() => window.clearTimeout(t))

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [])

  // Rattrapage best-effort de la synchro serveur : une fois le support connu,
  // quand le customerToken change (reconnexion) et quand l'onglet/l'app
  // redevient visible. N'affecte jamais l'UI (pas de setBusy/setSupported ici).
  useEffect(() => {
    if (!supported) return
    resync()
  }, [supported, resync])

  useEffect(() => {
    if (!supported) return
    const onVisible = () => {
      if (document.visibilityState === "visible") resync()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [supported, resync])

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
      syncedRef.current = `${json.endpoint}|${role}|${customerToken ?? ""}`
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
      syncedRef.current = null
      setSubscribed(false)
    } catch (e) {
      console.log("[v0] unsubscribe error:", e)
    } finally {
      setBusy(false)
    }
  }, [supported])

  return { supported, subscribed, permission, busy, subscribe, unsubscribe }
}
