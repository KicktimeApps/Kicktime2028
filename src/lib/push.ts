/**
 * Web Push (VAPID) über Service Worker + Supabase.
 * Ohne VITE_VAPID_PUBLIC_KEY oder Backend bleibt es bei lokalen Erinnerungen.
 */
import { PUBLIC_CONFIG } from "@/public-config";
import { getSupabase, isBackendConfigured } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { logError } from "./error-log";
import { useAppStore } from "@/store/app-store";

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

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return true; // Browser verrät den Schlüssel nicht – dann nicht eingreifen
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** Push-Abo anlegen und im Backend speichern. Gibt false zurück, wenn nicht möglich. */
export async function subscribePush(): Promise<boolean> {
  const sb = await getSupabase();
  if (!hasPushBackend() || !sb || Notification.permission !== "granted") return false;
  const reg = await ensureServiceWorker();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    // Abo mit einem alten Schlüssel (z. B. nach Schlüsselwechsel) würde vom
    // Push-Dienst abgelehnt – dann neu abonnieren.
    if (sub && !sameKey(sub.options.applicationServerKey, b64ToBytes(VAPID))) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
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
    // Neues Abo startet auf dem Server mit Tipp-Erinnerung an – Wahl des Nutzers übernehmen.
    if (!useAppStore.getState().tipReminders) void syncTipReminders(false);
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

// Zuletzt gewünschte Liste und eine laufende Test-Erinnerung. Die
// Test-Erinnerung wird bis zu ihrem Versand bei jedem Abgleich mitgeschickt,
// damit ein zwischenzeitlicher Abgleich sie nicht wieder löscht.
let lastWanted: AlarmPayload[] = [];
let pendingTest: AlarmPayload | null = null;

async function pushAlarms(list: AlarmPayload[]): Promise<boolean> {
  const sb = await getSupabase();
  if (!hasPushBackend() || !sb) return false;
  if (pendingTest && Date.parse(pendingTest.kickoffUtc) < Date.now()) pendingTest = null;
  const all = pendingTest ? [...list, pendingTest] : list;
  const { error } = await sb.rpc("kt_sync_alarms", {
    p_device: getDeviceId(),
    p_alarms: all.map((w) => ({
      match_id: w.matchId,
      kickoff_utc: w.kickoffUtc,
      lead_minutes: w.leadMinutes,
      title: w.title,
    })),
  });
  if (error) logError("push", `Erinnerungen synchronisieren: ${error.message}`);
  return !error;
}

/**
 * Ersetzt die serverseitigen Erinnerungen dieses Geräts durch die lokale
 * Liste (fehlende anlegen, überflüssige löschen, Anstoßzeiten aktualisieren).
 * Eine leere Liste stoppt alle Server-Erinnerungen dieses Geräts.
 */
export async function syncServerAlarms(wanted: AlarmPayload[]): Promise<void> {
  lastWanted = wanted;
  if (wanted.length === 0) pendingTest = null;
  await pushAlarms(wanted);
}

/**
 * Echte Test-Benachrichtigung über den kompletten Weg (Server → Apple →
 * iPhone): legt eine Test-Erinnerung mit Anpfiff in 2 Minuten an. Der
 * Cron-Job verschickt sie beim nächsten Lauf (spätestens nach ca. 1 Minute).
 */
export async function sendTestPush(): Promise<boolean> {
  if (!(await subscribePush())) return false;
  pendingTest = {
    matchId: `test-${Date.now()}`,
    kickoffUtc: new Date(Date.now() + 2 * 60_000).toISOString(),
    title: "Test: So kommt deine KickTime-Erinnerung an",
    leadMinutes: 15,
  };
  return pushAlarms(lastWanted);
}

/**
 * Tipp-Erinnerung („Noch kein Tipp“) auf dem Server an- oder ausschalten.
 * false, wenn das nicht ging (kein Abo, kein Netz, SQL-Update fehlt).
 */
export async function syncTipReminders(on: boolean): Promise<boolean> {
  try {
    const sb = await getSupabase();
    if (!sb) return false;
    const { data, error } = await sb.rpc("kt_set_tip_reminders", {
      p_device: getDeviceId(),
      p_on: on,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
