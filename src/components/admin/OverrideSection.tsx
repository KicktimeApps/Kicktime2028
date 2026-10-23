import { Minus, Plus, Trash2, Zap } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/common/Segmented";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { resultSignature, type LivePhase, type MatchStatus } from "@/domain/types";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { clearAllOverrides, clearOverride, setOverride } from "@/services/admin";
import { refreshLiveData } from "@/services/live-data";
import { useMatchStore } from "@/store/match-store";
import { ConfirmButton } from "./shared";
import { useAction } from "./use-action";

const PHASES: { value: LivePhase; label: string }[] = [
  { value: "first", label: "1. HZ" },
  { value: "half", label: "Pause" },
  { value: "second", label: "2. HZ" },
  { value: "extra", label: "Verl." },
  { value: "penalties", label: "Elfm." },
];

const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Geplant",
  live: "Live",
  finished: "Beendet",
};

/**
 * Korrekturen wie bei KickTime 2026: Suche, laufende Spiele oben, danach die
 * zeitlich nächsten. Jedes Spiel lässt sich direkt in der Liste ändern.
 */
export function OverrideSection({ pin }: { pin: string }) {
  const matches = useMatchStore((s) => s.tournament.matches);
  const now = useMatchStore((s) => s.now);
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...matches]
      .filter((m) => m.home && m.away)
      .filter((m) => {
        if (!q) return true;
        const hay = [
          teamDisplay(m.home, m.slotHome).name,
          teamDisplay(m.away, m.slotAway).name,
          m.home,
          m.away,
          `#${m.number}`,
          new Date(m.kickoffUtc).toLocaleDateString("de-DE"),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const live = (m: typeof a) => (m.status === "live" ? 0 : 1);
        if (live(a) !== live(b)) return live(a) - live(b);
        return Math.abs(Date.parse(a.kickoffUtc) - now) - Math.abs(Date.parse(b.kickoffUtc) - now);
      })
      .slice(0, 30);
  }, [matches, now, query]);

  const overrides = useMatchStore((s) => Object.keys(s.adminResults).length);
  const { busy, run } = useAction();
  return (
    <div className="space-y-3">
      {overrides > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[13px]">
          <span className="flex-1">
            <b>{overrides}</b> {overrides === 1 ? "Spiel ist" : "Spiele sind"} gerade korrigiert.
          </span>
          <ConfirmButton
            variant="danger-outline"
            className="h-8 px-2.5 text-[12.5px]"
            icon={<Trash2 />}
            busy={busy === "all"}
            title="Alle Korrekturen entfernen?"
            text="Danach gelten für alle Spiele wieder nur die Live-Daten."
            confirm="Alle entfernen"
            onConfirm={async () => {
              if (await run("all", () => clearAllOverrides(pin), "Alle Korrekturen entfernt"))
                await refreshLiveData();
            }}
          >
            Alle entfernen
          </ConfirmButton>
        </div>
      )}
      <p className="text-[12.5px] text-muted-foreground">
        OpenLigaDB gibt vor. Eine Korrektur überbrückt nur, wenn die Quelle hängt: Sobald dort ein
        neuer Stand ankommt (z. B. das Tor oder das Spielende), gilt automatisch wieder OpenLigaDB.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Team, Datum oder #Nummer suchen …"
        className="h-10 w-full rounded-xl border border-border bg-subtle px-3 text-[14px] outline-none focus:border-primary"
      />
      {list.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          {query ? "Nichts gefunden." : "Noch keine Paarungen bekannt."}
        </p>
      )}
      <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {list.map((m) => (
          <OverrideRowKeyed key={m.id} pin={pin} matchId={m.id} />
        ))}
      </ul>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label} minus`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-7 text-center font-display text-2xl font-bold tabular" aria-label={label}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} plus`}
        onClick={() => onChange(Math.min(30, value + 1))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 text-primary"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Meldet die Quelle einen neuen Stand, startet die Zeile mit den neuen Werten –
 * sonst würde „live schalten“ einen veralteten Stand an alle verteilen.
 */
function OverrideRowKeyed({ pin, matchId }: { pin: string; matchId: string }) {
  const sig = useMatchStore((s) => {
    const m = s.tournament.matches.find((x) => x.id === matchId);
    return m ? `${m.status}|${m.score?.home}:${m.score?.away}|${m.source}` : "";
  });
  return <OverrideRow key={sig} pin={pin} matchId={matchId} />;
}

function OverrideRow({ pin, matchId }: { pin: string; matchId: string }) {
  const m = useMatchStore((s) => s.tournament.matches.find((x) => x.id === matchId))!;
  const apiResult = useMatchStore((s) => s.apiResults[matchId]);
  const hasOverride = useMatchStore((s) => !!s.adminResults[matchId]);
  const [status, setStatus] = useState<MatchStatus>(m.status);
  const [home, setHome] = useState(m.score?.home ?? 0);
  const [away, setAway] = useState(m.score?.away ?? 0);
  const [pens, setPens] = useState<[number, number]>(
    m.penalties ? [m.penalties.home, m.penalties.away] : [0, 0],
  );
  const [phase, setPhase] = useState<LivePhase>(m.phase ?? "first");
  const [busy, setBusy] = useState(false);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const ko = m.stage !== "group";
  const withPens = ko && home === away && (status === "finished" || phase === "penalties");
  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, desc?: string) => {
      setBusy(true);
      const res = await fn();
      setBusy(false);
      if (res.ok) {
        haptics.success();
        toast.success(ok, desc ? { description: desc } : undefined);
        refreshLiveData();
      } else toast.error("Fehler", { description: res.error });
    },
    [],
  );
  return (
    <li
      className={cn(
        "space-y-2.5 rounded-xl border bg-card p-3",
        m.source === "admin" ? "border-primary/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Flag flag={a.flag} size="xs" />
        <span className="truncate">{a.name}</span>
        <span className="text-muted-foreground">–</span>
        <Flag flag={b.flag} size="xs" />
        <span className="truncate">{b.name}</span>
        <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
          {m.status === "live" ? "● live" : STATUS_LABEL[m.status]}
          {m.source === "admin" && " · korrigiert"}
        </span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          #{m.number} ·{" "}
          {new Date(m.kickoffUtc).toLocaleString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span>
          OpenLigaDB:{" "}
          {apiResult?.score
            ? `${apiResult.score.home}:${apiResult.score.away} (${STATUS_LABEL[apiResult.status]})`
            : "noch nichts"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <Stepper value={home} onChange={setHome} label="Tore Heim" />
        <span className="font-display text-xl text-muted-foreground">:</span>
        <Stepper value={away} onChange={setAway} label="Tore Gast" />
      </div>
      <Segmented<MatchStatus>
        size="sm"
        value={status}
        onChange={setStatus}
        options={(["scheduled", "live", "finished"] as const).map((v) => ({
          value: v,
          label: STATUS_LABEL[v],
        }))}
      />
      {status === "live" && (
        <Segmented<LivePhase>
          size="sm"
          value={phase}
          onChange={setPhase}
          options={ko ? PHASES : PHASES.slice(0, 3)}
        />
      )}
      {withPens && (
        <div className="flex items-center justify-between rounded-lg bg-subtle px-2 py-1.5">
          <span className="text-[12px] font-semibold">Elfmeter</span>
          <Stepper value={pens[0]} onChange={(v) => setPens([v, pens[1]])} label="Elfmeter Heim" />
          <span className="text-muted-foreground">:</span>
          <Stepper value={pens[1]} onChange={(v) => setPens([pens[0], v])} label="Elfmeter Gast" />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                setOverride(pin, {
                  matchId,
                  status,
                  scoreHome: home,
                  scoreAway: away,
                  pensHome: withPens ? pens[0] : null,
                  pensAway: withPens ? pens[1] : null,
                  phase: status === "live" ? phase : null,
                  sourceSig: resultSignature(apiResult),
                }),
              "Live geschaltet ⚡",
              `${a.name} ${home}:${away} ${b.name}`,
            )
          }
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Zap className="h-4 w-4" /> Änderungen live schalten
        </button>
        <button
          type="button"
          disabled={busy || !hasOverride}
          onClick={() => run(() => clearOverride(pin, matchId), "Korrektur entfernt")}
          aria-label="Korrektur entfernen"
          title="Korrektur entfernen – danach gelten wieder die Live-Daten"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/40 text-destructive disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
