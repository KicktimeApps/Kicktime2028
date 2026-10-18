import { useEffect, useState } from "react";
import { isAlarmActive, ALARM_LEAD_MINUTES } from "@/domain/alarms";
import { teamDisplay } from "@/domain/labels";
import { applyTheme } from "@/lib/theme";
import { scheduleLocalNotification } from "@/lib/notifications";
import { hasPushBackend, subscribePush, syncServerAlarms } from "@/lib/push";
import { pollInterval, refreshLiveData } from "@/services/live-data";
import { useAppStore } from "@/store/app-store";
import { useMatchStore } from "@/store/match-store";
import { KO_MATCH_WINDOW_MIN } from "@/tournament/config";

/**
 * Der „Motor“ der App – einmal im Root eingehängt:
 *  - Uhr (alle 10 s) für Live-Status & Countdown
 *  - Demo-Modus mit dem Match-Store synchronisieren
 *  - Live-Daten adaptiv nachladen
 *  - Theme anwenden
 *  - Erinnerungen planen (lokal + Server)
 */
export function useEngine(): void {
  const tick = useMatchStore((s) => s.tick);
  const demo = useAppStore((s) => s.demo);
  const theme = useAppStore((s) => s.theme);
  const accent = useAppStore((s) => s.accent);

  // Uhr
  useEffect(() => {
    tick();
    const id = window.setInterval(tick, 10_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);

  // Demo
  useEffect(() => {
    useMatchStore.getState().setDemo(demo);
  }, [demo]);

  // Theme (inkl. Wechsel des System-Modus)
  useEffect(() => {
    applyTheme(theme, accent);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme(theme, accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, accent]);

  // Live-Daten
  const liveWindow = useMatchStore((s) =>
    s.tournament.matches.some((m) => {
      const k = Date.parse(m.kickoffUtc);
      return s.now >= k - 15 * 60_000 && s.now <= k + (KO_MATCH_WINDOW_MIN + 20) * 60_000;
    }),
  );
  useEffect(() => {
    if (demo.enabled) return;
    let timer: number | undefined;
    let cancelled = false;
    const loop = async () => {
      await refreshLiveData();
      if (cancelled) return;
      const ms = pollInterval(Date.now(), liveWindow);
      if (ms) timer = window.setTimeout(loop, ms);
    };
    loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [demo.enabled, liveWindow]);

  // Erinnerungen – als String-Signatur selektiert, damit der Effekt nur bei
  // echten Änderungen (nicht bei jedem Uhr-Tick) neu läuft.
  const alarms = useAppStore((s) => s.alarms);
  const autoFav = useAppStore((s) => s.autoAlarmFavorites);
  const favorites = useAppStore((s) => s.favorites);
  const pushEnabled = useAppStore((s) => s.pushEnabled);
  const dueKey = useMatchStore((s) =>
    JSON.stringify(
      s.tournament.matches
        .filter(
          (m) =>
            m.status === "scheduled" &&
            m.kickoffConfirmed &&
            isAlarmActive(m, alarms, autoFav, favorites),
        )
        .map((m) => [
          m.id,
          m.kickoffUtc,
          `${teamDisplay(m.home, m.slotHome).name} – ${teamDisplay(m.away, m.slotAway).name}`,
        ]),
    ),
  );
  // Push-Abo bei jedem Start auffrischen: iOS kann Abos austauschen oder
  // verwerfen. Erst danach wissen wir, ob der Server zuständig ist.
  const [serverPush, setServerPush] = useState<boolean | null>(null);
  useEffect(() => {
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (!pushEnabled || demo.enabled || !hasPushBackend() || !granted) {
      setServerPush(false);
      return;
    }
    let cancelled = false;
    setServerPush(null);
    subscribePush().then((ok) => !cancelled && setServerPush(ok));
    return () => {
      cancelled = true;
    };
  }, [pushEnabled, demo.enabled]);

  // Erinnerungen aus oder Vorschau-Modus: Server-Erinnerungen dieses Geräts
  // löschen, sonst kämen weiter Push-Nachrichten.
  // Nur auf Geräten mit erteilter Erlaubnis – ohne sie gibt es kein Abo.
  useEffect(() => {
    if (pushEnabled && !demo.enabled) return;
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (granted && hasPushBackend()) void syncServerAlarms([]);
  }, [pushEnabled, demo.enabled]);

  useEffect(() => {
    if (!pushEnabled || demo.enabled || serverPush === null) return;
    const due = JSON.parse(dueKey) as Array<[string, string, string]>;
    // Lokal (solange die App offen ist) – nur ohne Server-Push, sonst käme
    // jede Erinnerung doppelt.
    const cancel =
      !serverPush && typeof Notification !== "undefined" && Notification.permission === "granted"
        ? due.map(([id, kickoff, title]) =>
            scheduleLocalNotification(
              Date.parse(kickoff) - ALARM_LEAD_MINUTES * 60_000,
              "Gleich geht's los ⚽",
              `${title} – Anpfiff in ${ALARM_LEAD_MINUTES} Minuten.`,
              `match-${id}`,
            ),
          )
        : [];
    // Server (zuverlässig im Hintergrund), leicht entprellt
    const t = serverPush
      ? window.setTimeout(() => {
          syncServerAlarms(
            due.map(([matchId, kickoffUtc, title]) => ({
              matchId,
              kickoffUtc,
              title,
              leadMinutes: ALARM_LEAD_MINUTES,
            })),
          );
        }, 1500)
      : undefined;
    return () => {
      cancel.forEach((c) => c());
      window.clearTimeout(t);
    };
  }, [dueKey, pushEnabled, demo.enabled, serverPush]);
}
