import { getDeviceId } from "@/lib/device-id";
import { getSupabase } from "./supabase";

/**
 * Meldet dem KickTime-Team, wenn eine Datenquelle auf diesem Gerät ausfällt –
 * die Zweitquelle ESPN (kann nur die App prüfen, ESPN sperrt Rechenzentren)
 * oder der eigene Server. Der Server bündelt die Meldungen und schickt erst
 * bei mehreren Geräten bzw. anhaltenden Fehlern eine Mitteilung (Wächter).
 * Höchstens alle 5 Minuten je Quelle; ohne Netz kommt nichts an – dann gibt es
 * auch keinen Fehlalarm. Fehler beim Melden sind egal.
 */
export type ReportedSource = "espn" | "backend";

const EVERY_MS = 5 * 60_000;
const last: Partial<Record<ReportedSource, number>> = {};

export function reportSourceIssue(source: ReportedSource, detail: string): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (now - (last[source] ?? 0) < EVERY_MS) return;
  last[source] = now;
  void (async () => {
    try {
      const sb = await getSupabase();
      await sb?.rpc("kt_report_source", {
        p_device: getDeviceId(),
        p_source: source,
        p_detail: detail.slice(0, 200),
      });
    } catch {
      /* Melden ist nur ein Zusatz */
    }
  })();
}
