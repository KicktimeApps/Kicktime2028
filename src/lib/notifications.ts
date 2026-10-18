/**
 * Benachrichtigungen – Fähigkeiten erkennen & lokale Erinnerungen.
 *
 * iOS erlaubt Web-Push nur für zum Home-Bildschirm hinzugefügte Apps
 * (ab iOS 16.4). Lokale Erinnerungen funktionieren nur bei geöffneter App;
 * zuverlässig im Hintergrund klappt es nur mit Push-Backend.
 */
export type PushSupport = "granted" | "denied" | "default" | "unsupported" | "ios-needs-pwa";

const isIos = () =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

export const isStandalone = () => {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
};

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-needs-pwa";
  return Notification.permission as PushSupport;
}

export async function requestPushPermission(): Promise<PushSupport> {
  const support = detectPushSupport();
  if (support === "unsupported" || support === "ios-needs-pwa" || support === "granted")
    return support;
  try {
    return (await Notification.requestPermission()) as PushSupport;
  } catch {
    return "denied";
  }
}

export function scheduleLocalNotification(
  whenMs: number,
  title: string,
  body: string,
  tag: string,
): () => void {
  if (typeof window === "undefined") return () => {};
  const delay = whenMs - Date.now();
  // setTimeout ist auf ~24,8 Tage begrenzt
  if (delay <= 0 || delay > 2_000_000_000) return () => {};
  const handle = window.setTimeout(() => void showNotification(title, body, tag), delay);
  return () => window.clearTimeout(handle);
}

/**
 * Zeigt eine Benachrichtigung – bevorzugt über den Service Worker, denn als
 * Home-Bildschirm-App kennt iOS `new Notification()` nicht.
 */
async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options = { body, tag, icon: "/icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* Fallback unten */
  }
  try {
    new Notification(title, options);
  } catch {
    /* noop */
  }
}
