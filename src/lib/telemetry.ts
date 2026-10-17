/**
 * Anonyme Nutzungs-Statistik (nur mit Backend): eine zufällige Geräte-ID,
 * App-Version und das erste Favoriten-Team. Keine IP, keine Personendaten.
 * Bots werden über den User-Agent gefiltert, „Do Not Track“ wird respektiert.
 */
import { getSupabase } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { getDeviceId } from "./device-id";
import { APP_VERSION } from "./version";

const LAST_KEY = "kicktime-2028.last-ping";
const MIN_INTERVAL = 10 * 60_000;
const BOT_UA = /(bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime)/i;

export async function sendPing(): Promise<void> {
  const sb = getSupabase();
  if (!sb || typeof navigator === "undefined") return;
  if (BOT_UA.test(navigator.userAgent) || navigator.doNotTrack === "1") return;
  if (useAppStore.getState().demo.enabled) return;
  try {
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (Date.now() - last < MIN_INTERVAL) return;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    await sb.from("app_pings").upsert(
      {
        client_id: getDeviceId(),
        last_ping: new Date().toISOString(),
        app_version: APP_VERSION,
        fav_team: useAppStore.getState().favorites[0] ?? null,
      },
      { onConflict: "client_id" },
    );
  } catch {
    /* Statistik ist unkritisch */
  }
}
