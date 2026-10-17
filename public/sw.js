/**
 * KickTime Service Worker — ausschließlich für Web-Push.
 *
 * Bewusst KEIN Offline-/HTML-Cache, damit es mit Lovable-Preview-Builds
 * keinen Stale-Content geben kann. Registrierung läuft ausschließlich
 * im veröffentlichten Build über src/lib/push-client.ts (Guards inside).
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { title: "KickTime", body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || "Anpfiff steht bevor! 🏆";
  const body = payload.body || "Gleich startet dein Spiel!";
  const url = payload.url || "/";
  const tag = payload.tag || "kicktime-match";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url },
      requireInteraction: false,
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        try {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        } catch {
          /* noop */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
