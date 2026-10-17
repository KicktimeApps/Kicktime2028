/**
 * Web Push (VAPID) über Service Worker + Supabase.
 * Ohne VITE_VAPID_PUBLIC_KEY oder Backend bleibt es bei lokalen Erinnerungen.
 */
import { getSupabase } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { logError } from "./error-log";

const SW_PATH = "/sw.js";
const VAPID = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "").trim();

export const hasPushBackend = () => VAPID.length > 20 && !!getSupabase();

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
  const sb = getSupabase();
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
    const { error } = await sb.from("push_subscriptions").upsert(
      {
        device_id: getDeviceId(),
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 250),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );
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
 * Gleicht die serverseitigen Erinnerungen mit der lokalen Liste ab: fehlende
 * anlegen, nicht mehr gewünschte löschen. Anstoßzeiten werden aktualisiert.
 */
export async function syncServerAlarms(wanted: AlarmPayload[]): Promise<void> {
  const sb = getSupabase();
  if (!hasPushBackend() || !sb) return;
  const device_id = getDeviceId();
  try {
    const { data, error } = await sb
      .from("match_alarms")
      .select("match_id")
      .eq("device_id", device_id);
    if (error) throw new Error(error.message);
    const existing = new Set((data ?? []).map((r: { match_id: string }) => r.match_id));
    const wantedIds = new Set(wanted.map((w) => w.matchId));
    const remove = [...existing].filter((id) => !wantedIds.has(id));
    if (remove.length > 0) {
      await sb.from("match_alarms").delete().eq("device_id", device_id).in("match_id", remove);
    }
    if (wanted.length > 0) {
      const rows = wanted.map((w) => ({
        device_id,
        match_id: w.matchId,
        kickoff_utc: w.kickoffUtc,
        lead_minutes: w.leadMinutes,
        title: w.title,
      }));
      const { error: upErr } = await sb
        .from("match_alarms")
        .upsert(rows, { onConflict: "device_id,match_id" });
      if (upErr) throw new Error(upErr.message);
    }
  } catch (err) {
    logError(
      "push",
      `Erinnerungen synchronisieren: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
