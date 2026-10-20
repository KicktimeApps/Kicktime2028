import { ChevronRight } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getErrors, subscribeErrors } from "@/lib/error-log";
import { cn } from "@/lib/utils";
import {
  fetchConfig,
  fetchGroups,
  fetchStats,
  type AdminConfig,
  type AdminGroup,
  type Stats,
} from "@/services/admin";
import { useMatchStore } from "@/store/match-store";
import type { AdminSection } from "./AdminPanel";

/** Auf einen Blick: Läuft alles? Was ist offen? Antippen springt in den Bereich. */
export function OverviewSection({ pin, go }: { pin: string; go: (s: AdminSection) => void }) {
  const live = useMatchStore((s) => s.live);
  const overrides = useMatchStore((s) => Object.keys(s.adminResults).length);
  const errors = useSyncExternalStore(subscribeErrors, getErrors, getErrors);
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [groups, setGroups] = useState<AdminGroup[] | null>(null);
  useEffect(() => {
    void fetchStats(pin).then((r) => r.ok && setStats(r.data));
    void fetchConfig(pin).then((r) => r.ok && setConfig(r.data));
    void fetchGroups(pin).then((r) => r.ok && setGroups(r.data.data ?? []));
  }, [pin]);

  const liveOk = !live.lastError && live.cache !== "stale";
  const paused = config?.liveSource?.paused === true;
  const pending = (groups ?? []).reduce((n, g) => n + Number(g.pending), 0);
  const ext = stats?.ext;

  return (
    <div className="space-y-2 text-[13.5px]">
      <Row
        tone={paused ? "warn" : liveOk ? "good" : "bad"}
        title="Live-Daten"
        value={paused ? "angehalten" : liveOk ? "läuft" : "Störung"}
        text={
          live.lastFetchAt
            ? `Zuletzt ${new Date(live.lastFetchAt).toLocaleTimeString("de-DE")}${live.lastError ? ` · ${live.lastError}` : ""}`
            : "Noch kein Abruf"
        }
        onClick={() => go("live")}
      />
      <Row
        tone="neutral"
        title="Nutzer"
        value={ext ? `${ext.today} heute` : stats ? `${stats.day} in 24 h` : "–"}
        text={
          ext
            ? `${ext.online} gerade online · ${ext.week} in 7 Tagen · ${ext.total} gesamt`
            : undefined
        }
        onClick={() => go("stats")}
      />
      <Row
        tone={pending > 0 ? "warn" : "neutral"}
        title="Tipprunden"
        value={groups ? `${groups.length}` : "–"}
        text={
          groups
            ? pending > 0
              ? `${pending} offene Beitrittsanfragen`
              : "Keine offenen Anfragen"
            : undefined
        }
        onClick={() => go("groups")}
      />
      <Row
        tone={overrides > 0 ? "warn" : "neutral"}
        title="Korrekturen"
        value={String(overrides)}
        text={overrides > 0 ? "Überbrücken gerade die Live-Daten" : "Keine aktiv"}
        onClick={() => go("override")}
      />
      <Row
        tone={config?.announcement ? "good" : "neutral"}
        title="Hinweis in der App"
        value={config?.announcement ? "aktiv" : "aus"}
        text={config?.announcement?.text}
        onClick={() => go("messages")}
      />
      <Row
        tone={errors.length > 0 ? "warn" : "neutral"}
        title="Fehlerprotokoll"
        value={String(errors.length)}
        text={errors[0]?.message}
        onClick={() => go("system")}
      />
    </div>
  );
}

const DOT = {
  good: "bg-primary",
  warn: "bg-gold",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

function Row({
  tone,
  title,
  value,
  text,
  onClick,
}: {
  tone: keyof typeof DOT;
  title: string;
  value: ReactNode;
  text?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left hover:border-primary/40"
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="shrink-0 font-semibold tabular">{value}</span>
        </span>
        {text && <span className="block truncate text-[12px] text-muted-foreground">{text}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
