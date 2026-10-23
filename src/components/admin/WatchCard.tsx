import { BellRing, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchAlerts, sendAlertTest, type WatchAlert } from "@/services/admin";
import { ActionButton, Card } from "./shared";
import { TeamDeviceRow } from "./TeamDevice";
import { fmtTime, useAction } from "./use-action";

/**
 * Wächter: Der Server prüft rund um jedes Spiel jede 2. Minute, ob Live-Daten
 * ankommen (OpenLigaDB, Zweitquelle ESPN, eigener Server), und schickt dem
 * KickTime-Team bei Problemen eine Mitteilung – und wenn es wieder läuft.
 */
export function WatchCard({ pin }: { pin: string }) {
  const { busy, run } = useAction();
  const [alerts, setAlerts] = useState<WatchAlert[] | null | undefined>(undefined);
  // Geräte-Status (letzte Zustellung) mit neu laden.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => {
    setReloadKey((k) => k + 1);
    const data = await run("alerts", () => fetchAlerts(pin));
    if (data) setAlerts(data.alerts);
  }, [pin, run]);
  useEffect(() => {
    void load();
  }, [load]);
  // Nach einem Test: Der Server verschickt im nächsten Lauf (≤ 1 Minute) –
  // danach die Zustellung neu abfragen.
  const later = useRef(0);
  useEffect(() => () => window.clearTimeout(later.current), []);

  const active = (alerts ?? []).filter((a) => a.active);
  const solved = (alerts ?? []).filter((a) => !a.active).slice(0, 5);

  return (
    <Card
      title="Wächter"
      text="Meldet dir per Mitteilung, wenn Spielstände nicht ankommen – und wenn es wieder läuft."
      action={
        <button
          type="button"
          onClick={load}
          aria-label="Neu laden"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", busy === "alerts" && "animate-spin")} />
        </button>
      }
    >
      {alerts === null ? (
        <p className="rounded-xl bg-gold/10 px-3 py-2 text-[13px]">
          Noch nicht eingerichtet – das SQL-Update „Wächter und Tipp-Erinnerung“ fehlt.
        </p>
      ) : alerts === undefined ? null : (
        <ul className="space-y-1.5">
          {active.length === 0 && (
            <li className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-[13.5px]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              Alles in Ordnung
            </li>
          )}
          {active.map((a) => (
            <li key={a.key} className="rounded-xl bg-destructive/10 px-3 py-2 text-[13.5px]">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                <span className="min-w-0 flex-1">{a.message}</span>
              </div>
              <div className="mt-0.5 pl-4 text-[11.5px] text-muted-foreground">
                seit {fmtTime(a.first_at)} · zuletzt geprüft {fmtTime(a.last_seen_at)}
              </div>
            </li>
          ))}
          {solved.map((a) => (
            <li key={a.key} className="px-3 py-1 text-[12.5px] text-muted-foreground">
              ✓ behoben {fmtTime(a.resolved_at)}: {a.message}
            </li>
          ))}
        </ul>
      )}
      <TeamDeviceRow pin={pin} reloadKey={reloadKey} />
      <ActionButton
        icon={<BellRing />}
        busy={busy === "test"}
        onClick={async () => {
          const ok = await run(
            "test",
            () => sendAlertTest(pin),
            (d) =>
              `Test an ${d.count} Gerät${d.count === 1 ? "" : "e"} – kommt in etwa 1 Minute` +
              (d.skipped ? ` (${d.skipped} ohne Mitteilungen übersprungen)` : ""),
          );
          if (!ok) return;
          window.clearTimeout(later.current);
          later.current = window.setTimeout(() => setReloadKey((k) => k + 1), 70_000);
        }}
        className="w-full"
      >
        Test-Mitteilung schicken
      </ActionButton>
    </Card>
  );
}
