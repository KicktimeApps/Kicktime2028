import { Loader2, Lock, Minus, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/common/Segmented";
import { Flag } from "@/components/team/Flag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { teamDisplay } from "@/domain/labels";
import { resultSignature, type LivePhase, type MatchStatus } from "@/domain/types";
import { clearErrors, getErrors, subscribeErrors } from "@/lib/error-log";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  clearOverride,
  fetchFeedback,
  fetchStats,
  setOverride,
  verifyPin,
  type FeedbackRow,
  type Stats,
} from "@/services/admin";
import { refreshLiveData } from "@/services/live-data";
import { isBackendConfigured } from "@/services/supabase";
import { useMatchStore } from "@/store/match-store";

type Tab = "system" | "override" | "stats";

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pin, setPin] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("system");
  useEffect(() => {
    if (!open) setPin(null);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle>Admin · Kontrollzentrum</DialogTitle>
          <DialogDescription>
            Nur für den Betreiber. Aktionen wirken für alle Nutzer.
          </DialogDescription>
        </DialogHeader>
        {!isBackendConfigured() ? (
          <p className="rounded-xl bg-subtle p-4 text-[13.5px] text-muted-foreground">
            Kein Backend konfiguriert – Admin-Funktionen benötigen Supabase (siehe README).
          </p>
        ) : !pin ? (
          <PinGate onUnlock={setPin} />
        ) : (
          <>
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "system", label: "System" },
                { value: "override", label: "Korrektur" },
                { value: "stats", label: "Statistik" },
              ]}
            />
            {tab === "system" && <SystemTab />}
            {tab === "override" && <OverrideTab pin={pin} />}
            {tab === "stats" && <StatsTab pin={pin} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (v: string) => {
    setBusy(true);
    const ok = await verifyPin(v);
    setBusy(false);
    if (ok) {
      haptics.success();
      onUnlock(v);
    } else {
      haptics.warn();
      setError(true);
      setValue("");
    }
  };
  return (
    <form
      className="flex flex-col items-center gap-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.length >= 6) submit(value);
      }}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
      </span>
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={value}
        onChange={(e) => {
          setError(false);
          setValue(e.target.value.replace(/\D/g, ""));
        }}
        placeholder="PIN"
        aria-label="Admin-PIN"
        className={cn(
          "h-12 w-48 rounded-xl border bg-subtle text-center text-2xl tracking-[0.4em] outline-none",
          error ? "border-destructive" : "border-border focus:border-primary",
        )}
      />
      {error && <p className="text-[13px] text-destructive">Falsche PIN oder zu viele Versuche.</p>}
      <button
        type="submit"
        disabled={busy || value.length < 6}
        className="h-10 rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        Entsperren
      </button>
    </form>
  );
}

function SystemTab() {
  const live = useMatchStore((s) => s.live);
  const errors = useSyncExternalStore(subscribeErrors, getErrors, getErrors);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 text-[13.5px]">
      <div className="grid grid-cols-2 gap-2">
        <Info label="Quelle" value={live.source ?? "–"} />
        <Info
          label="Letzter Abruf"
          value={live.lastFetchAt ? new Date(live.lastFetchAt).toLocaleTimeString("de-DE") : "–"}
        />
        <Info label="Fehler" value={live.lastError ?? "keiner"} />
        <Info label="Nicht zugeordnet" value={String(live.unmatched)} />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refreshLiveData({ force: true });
          setBusy(false);
          toast.success("Daten neu geladen");
        }}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Zap className="h-4 w-4" /> Sofort neu laden (Cache umgehen)
      </button>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold">Fehlerprotokoll</span>
          <button type="button" onClick={clearErrors} className="text-[12px] text-muted-foreground">
            Leeren
          </button>
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-subtle p-2 font-mono text-[11.5px]">
          {errors.length === 0 && <li className="text-muted-foreground">Keine Fehler 🎉</li>}
          {errors.map((e, i) => (
            <li key={i}>
              <span className="text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString("de-DE")}
              </span>{" "}
              <span className="text-primary">[{e.category}]</span> {e.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-subtle px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}

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
function OverrideTab({ pin }: { pin: string }) {
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

  return (
    <div className="space-y-3">
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border active:scale-95"
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 text-primary active:scale-95"
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

function StatsTab({ pin }: { pin: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [s, f] = await Promise.all([fetchStats(pin), fetchFeedback(pin)]);
    setBusy(false);
    if (s.ok) setStats(s.data);
    if (f.ok) setFeedback(f.data.rows);
  }, [pin]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="space-y-3 text-[13.5px]">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          aria-label="Aktualisieren"
          className="text-muted-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Info label="Jetzt online" value={String(stats?.online ?? "–")} />
        <Info label="24 Stunden" value={String(stats?.day ?? "–")} />
        <Info label="7 Tage" value={String(stats?.week ?? "–")} />
        <Info label="Gesamt" value={String(stats?.total ?? "–")} />
      </div>
      {stats && stats.topTeams.length > 0 && (
        <div>
          <div className="mb-1 font-semibold">Top-Favoriten</div>
          <ul className="space-y-1">
            {stats.topTeams.map((t) => (
              <li key={t.team} className="flex items-center gap-2">
                <Flag flag={teamDisplay(t.team, "").flag} size="xs" />{" "}
                {teamDisplay(t.team, t.team).name}
                <span className="ml-auto tabular text-muted-foreground">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1 font-semibold">Feedback</div>
        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
          {feedback.length === 0 && <li className="text-muted-foreground">Noch kein Feedback.</li>}
          {feedback.map((f, i) => (
            <li key={i} className="rounded-lg bg-subtle px-2.5 py-1.5">
              {f.rating > 0 ? "👍" : f.rating < 0 ? "👎" : "😐"}{" "}
              {f.message ?? <span className="text-muted-foreground">ohne Text</span>}
              <span className="block text-[11px] text-muted-foreground">
                {new Date(f.created_at).toLocaleString("de-DE")} · v{f.app_version}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
