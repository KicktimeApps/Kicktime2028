/**
 * Web Push (VAPID) über Service Worker + Supabase.
 * Ohne VITE_VAPID_PUBLIC_KEY oder Backend bleibt es bei lokalen Erinnerungen.
 */
import { PUBLIC_CONFIG } from "@/public-config";
import { getSupabase, isBackendConfigured } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { logError } from "./error-log";

const SW_PATH = "/sw.js";
const VAPID = (
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || PUBLIC_CONFIG.vapidPublicKey
).trim();

export const hasPushBackend = () => VAPID.length > 20 && isBackendConfigured();

function unsafeContext(): boolean {
  if (typeof window === "undefined" || !import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true; // Vorschau-iframes
  } catch {
    return true;
  }
  return new URL(window.location.href).searchParams.get("sw") === "off";
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (unsafeContext() || !("serviceWorker" in navigator)) return null;
  try {
    return (
      (await navigator.serviceWorker.getRegistration(SW_PATH)) ??
      (await navigator.serviceWorker.register(SW_PATH, { scope: "/" }))
    );
  } catch (err) {
    logError("push", `Service Worker: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function b64ToBytes(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Push-Abo anlegen und im Backend speichern. Gibt false zurück, wenn nicht möglich. */
export async function subscribePush(): Promise<boolean> {
  const sb = await getSupabase();
  if (!hasPushBackend() || !sb || Notification.permission !== "granted") return false;
  const reg = await ensureServiceWorker();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = b64ToBytes(VAPID);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer as ArrayBuffer,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { error } = await sb.rpc("kt_save_subscription", {
      p_device: getDeviceId(),
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    logError("push", `Abo fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export type AlarmPayload = {
  matchId: string;
  kickoffUtc: string;
  title: string;
  leadMinutes: number;
};

/**
 * Ersetzt die serverseitigen Erinnerungen dieses Geräts durch die lokale
 * Liste (fehlende anlegen, überflüssige löschen, Anstoßzeiten aktualisieren).
 */
export async function syncServerAlarms(wanted: AlarmPayload[]): Promise<void> {
  const sb = await getSupabase();
  if (!hasPushBackend() || !sb) return;
  const { error } = await sb.rpc("kt_sync_alarms", {
    p_device: getDeviceId(),
    p_alarms: wanted.map((w) => ({
      match_id: w.matchId,
      kickoff_utc: w.kickoffUtc,
      lead_minutes: w.leadMinutes,
      title: w.title,
    })),
  });
  if (error) logError("push", `Erinnerungen synchronisieren: ${error.message}`);
}
