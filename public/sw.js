/**
 * KickTime Service Worker – ausschließlich für Web-Push.
 *
 * Bewusst KEIN Offline-Cache für HTML/JS, damit nach einem Deployment nie
 * veraltete Versionen hängen bleiben. Registrierung nur im Produktions-Build
 * (siehe src/lib/push.ts).
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "KickTime", {
      body: payload.body || "Gleich geht's los!",
      tag: payload.tag || "kicktime",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          // navigate() schlägt bei nicht gesteuerten Fenstern fehl – dann reicht der Fokus.
          return client
            .focus()
            .then((c) => (c && "navigate" in c ? c.navigate(url) : undefined))
            .catch(() => undefined);
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
