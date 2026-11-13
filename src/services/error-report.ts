import { getDeviceId } from "@/lib/device-id";
import { getErrors, subscribeErrors, type ErrorEntry } from "@/lib/error-log";
import { isLikelyBot } from "@/lib/telemetry";
import { APP_VERSION } from "@/lib/version";
import { getSupabase } from "./supabase";

/**
 * Meldet Fehler dieser App dem KickTime-Team (sichtbar in der Team-App) –
 * sonst erfährt niemand, wenn bei Nutzern etwas kaputt ist. Gemeldet werden
 * nur Art, ein kurzer Text ohne Kennungen und die App-Version; der Server
 * begrenzt je Gerät (5 pro Stunde, gleiche Meldung einmal am Tag). Nicht bei
 * „Do Not Track“, Bots oder ohne Netz. Fehler beim Melden sind egal.
 */
const MAX_PER_SESSION = 10;

/** Kennungen (Geräte-IDs, Schlüssel, Adress-Parameter) aus dem Text nehmen. */
export function sanitizeError(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "…")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "…")
    .replace(/\?[^\s"')]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Welche Einträge noch nicht gemeldet sind (je Text nur einmal je Sitzung). */
export function unreported(entries: readonly ErrorEntry[], sent: Set<string>): ErrorEntry[] {
  const out: ErrorEntry[] = [];
  for (const e of [...entries].reverse()) {
    const key = `${e.category}:${sanitizeError(e.message)}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) continue;
    sent.add(key);
    out.push(e);
  }
  return out;
}

/** Einmal beim Start einhängen; gibt die Abmelde-Funktion zurück. */
export function installErrorReporting(): () => void {
  if (typeof navigator === "undefined") return () => {};
  if (navigator.doNotTrack === "1") return () => {};
  if (isLikelyBot(navigator.userAgent, navigator.webdriver === true)) return () => {};
  const sent = new Set<string>();
  const flush = () => {
    if (navigator.onLine === false) return;
    for (const e of unreported(getErrors(), sent)) {
      const message = sanitizeError(e.message);
      if (!message) continue;
      void (async () => {
        try {
          const sb = await getSupabase();
          await sb?.rpc("kt_report_error", {
            p_device: getDeviceId(),
            p_category: e.category,
            p_message: message,
            p_version: APP_VERSION,
          });
        } catch {
          /* Melden ist nur ein Zusatz */
        }
      })();
    }
  };
  flush();
  return subscribeErrors(flush);
}
