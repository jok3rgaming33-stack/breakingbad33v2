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
  const options = {
    body: data.body || "",
    icon: "/images/logoapp.png",
    badge: "/images/logoapp.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
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

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      readPing,
    ])
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || "/"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Si un onglet de l'app est déjà ouvert, on le focus et on navigue.
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus()
          if ("navigate" in client) {
            try {
              client.navigate(targetUrl)
            } catch (e) {}
          }
          return
        }
      }
      // Sinon on ouvre une nouvelle fenêtre.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
