// Service Worker pour les notifications push Web de BreakingBad33.
// Reçoit les messages push et affiche une notification système,
// même quand le site / l'app est fermé ou en arrière-plan.

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "BreakingBad33", body: event.data ? event.data.text() : "" }
  }

  const note = data.notification && typeof data.notification === "object" ? data.notification : {}
  const title = data.title || note.title || "BreakingBad33"
  const targetUrl = data.url || note.navigate || "/"
  // Tag unique : un tag stable remplaçait la notification précédente sans son.
  const stamp = Date.now()
  const options = {
    body: data.body || note.body || "",
    icon: "/images/logoapp.png",
    badge: "/apple-icon.png",
    tag: note.tag || (data.tag ? `${data.tag}-${stamp}` : `bb33-${stamp}`),
    renotify: true,
    data: {
      url: targetUrl,
      threadId: data.threadId || null,
      open: data.open || null,
      notificationId: data.notificationId || null,
    },
    ...(data.image ? { image: data.image } : {}),
  }

  // L'affichage d'abord. Le badge et le ping ne doivent pas faire rater l'alerte :
  // sur iOS, un push sans notification visible révoque l'abonnement.
  const show = self.registration.showNotification(title, options).catch(() =>
    self.registration.showNotification(title, {
      body: options.body,
      tag: options.tag,
      data: options.data,
    }),
  )

  event.waitUntil(
    show.then(() => {
      const extras = []
      if (data.notificationId && data.customerToken) {
        extras.push(
          fetch("/api/notification-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notificationId: data.notificationId,
              customerToken: data.customerToken,
            }),
          }).catch(() => {}),
        )
      }
      extras.push(
        (async () => {
          try {
            if (typeof self.registration.setAppBadge !== "function") return
            if (typeof data.badgeCount === "number" && data.badgeCount >= 0) {
              if (data.badgeCount === 0) await self.registration.clearAppBadge?.()
              else await self.registration.setAppBadge(data.badgeCount)
              return
            }
            const existing = await self.registration.getNotifications()
            await self.registration.setAppBadge(existing.length)
          } catch (e) {
            /* ignore */
          }
        })(),
      )
      return Promise.all(extras)
    }),
  )
})

// iOS change l'adresse de push sans ouvrir l'app. Sans ça, les envois suivants
// partent dans le vide jusqu'à la prochaine ouverture.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      let sub = event.newSubscription || null
      if (!sub) {
        const keyRes = await fetch("/api/push/vapid")
        if (!keyRes.ok) return
        const { publicKey } = await keyRes.json()
        if (!publicKey) return
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys) return
      await fetch("/api/push/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null,
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const nd = event.notification.data || {}
  const targetUrl = nd.url || "/"

  event.waitUntil(
    Promise.all([
      // Recalcule le badge après fermeture de cette notif
      (async () => {
        try {
          if (typeof self.registration.setAppBadge !== "function") return
          const left = await self.registration.getNotifications()
          const n = Math.max(0, left.length - 1) // celle cliquée va se fermer
          if (n <= 0) await self.registration.clearAppBadge?.()
          else await self.registration.setAppBadge(n)
        } catch (e) {}
      })(),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        // Préfère un onglet déjà sur le site (même origine)
        for (const client of clientList) {
          try {
            const origin = self.location.origin
            if (client.url && client.url.startsWith(origin) && "focus" in client) {
              client.focus()
              // Deep-link SPA sans rechargement complet si possible
              try {
                client.postMessage({
                  type: "BB33_DEEP_LINK",
                  url: targetUrl,
                  threadId: nd.threadId || null,
                  open: nd.open || null,
                })
              } catch (e) {}
              try {
                client.postMessage({ type: "BB33_REFRESH_BADGES" })
              } catch (e) {}
              // Fallback navigate si l'URL diffère vraiment
              if ("navigate" in client && targetUrl) {
                try {
                  const abs = new URL(targetUrl, origin).href
                  if (client.url.split("?")[0] !== abs.split("?")[0] || abs.includes("?")) {
                    client.navigate(abs)
                  }
                } catch (e) {}
              }
              return
            }
          } catch (e) {}
        }
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus()
            try {
              client.postMessage({ type: "BB33_DEEP_LINK", url: targetUrl })
              client.postMessage({ type: "BB33_REFRESH_BADGES" })
            } catch (e) {}
            return
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      }),
    ]),
  )
})
