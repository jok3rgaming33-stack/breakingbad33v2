// Service Worker pour les notifications push Web de BreakingBad33.
// Reçoit les messages push et affiche une notification système,
// même quand le site / l'app est fermé ou en arrière-plan.

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "BreakingBad33", body: event.data ? event.data.text() : "" }
  }

  const title = data.title || "BreakingBad33"
  const targetUrl = data.url || "/"
  const options = {
    body: data.body || "",
    icon: "/images/logoapp.png",
    badge: "/images/logoapp.png",
    tag: data.tag || undefined,
    // Conservé pour le clic → deep-link (messagerie / commande / admin)
    data: {
      url: targetUrl,
      threadId: data.threadId || null,
      open: data.open || null,
      notificationId: data.notificationId || null,
    },
    vibrate: [80, 40, 80],
    // Propriété "image" : grande image affichée dans le corps de la notification
    // (Android Chrome, Edge). Ignorée silencieusement sur les plateformes qui ne la supportent pas.
    ...(data.image ? { image: data.image } : {}),
  }

  // Ping le serveur pour marquer la notification comme reçue/lue par ce client.
  // notificationId et customerToken sont injectés dans le payload côté serveur.
  const readPing = (data.notificationId && data.customerToken)
    ? fetch("/api/notification-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: data.notificationId,
          customerToken: data.customerToken,
        }),
      }).catch(() => {})
    : Promise.resolve()

  // Badge icône app (PWA) : compte fourni ou nombre de notifs système en attente
  const badgeUpdate = (async () => {
    try {
      if (typeof self.registration.setAppBadge !== "function") return
      if (typeof data.badgeCount === "number" && data.badgeCount >= 0) {
        if (data.badgeCount === 0) await self.registration.clearAppBadge?.()
        else await self.registration.setAppBadge(data.badgeCount)
        return
      }
      const existing = await self.registration.getNotifications()
      // +1 pour la notif qui va s'afficher
      const n = existing.length + 1
      await self.registration.setAppBadge(n)
    } catch (e) {
      /* ignore */
    }
  })()

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      readPing,
      badgeUpdate,
    ])
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
