import { CheckCircle2, ChevronDown, Copy, Eye, Loader2, Target, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Section } from "@/components/common/Section";
import { Segmented } from "@/components/common/Segmented";
import { PredictionEditor } from "@/components/match/PredictionEditor";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import {
  canPredict,
  RESULT_LABEL,
  scorePrediction,
  summarize,
  type Prediction,
  type PredictionResult,
} from "@/domain/predictions";
import { recommend } from "@/domain/recommend";
import { formatDayLong, formatDayShort, formatTime, localParts, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { useContextTips, type TipContext } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { importTips, TipError } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { ChampionTipCard } from "./TipGroups";

const RESULT_COLOR: Record<PredictionResult, string> = {
  exact: "bg-primary",
  diff: "bg-primary/60",
  tendency: "bg-gold",
  miss: "bg-muted-foreground/30",
};

function MatchHead({ m, day = true }: { m: MatchView; day?: boolean }) {
  const prefs = usePrefs();
  const openMatch = useUi((s) => s.openMatch);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  return (
    <button type="button" onClick={() => openMatch(m.id)} className="block w-full text-left">
      <span className="block text-[13px] text-muted-foreground tabular">
        {day && `${formatDayShort(m.kickoffUtc, prefs.timeZone)} · `}
        {formatTime(m.kickoffUtc, prefs.timeZone)} Uhr
      </span>
      <span className="mt-1 flex items-center gap-2">
        <Flag flag={a.flag} size="sm" />
        <span className="truncate text-[15px] font-semibold">{a.name}</span>
        <span className="text-muted-foreground">–</span>
        <span className="truncate text-[15px] font-semibold">{b.name}</span>
        <Flag flag={b.flag} size="sm" />
      </span>
    </button>
  );
}

/** Ausgewertetes Spiel – bei Spoilerschutz erst nach „Zeigen“ mit Ergebnis und Punkten. */
function RatedRow({ m, tip }: { m: MatchView; tip: Prediction }) {
  const { hidden, reveal } = useSpoiler(m);
  const r = scorePrediction(tip, m.score!, m.stage);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <span
        className={cn(
          "h-8 w-1 shrink-0 rounded-full",
          hidden ? "bg-muted-foreground/30" : RESULT_COLOR[r.result],
        )}
      />
      <div className="min-w-0 flex-1">
        <MatchHead m={m} />
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          Tipp {tip.home}:{tip.away}
          {!hidden && (
            <>
              {" "}
              · Ergebnis {m.score!.home}:{m.score!.away} · {RESULT_LABEL[r.result]}
            </>
          )}
        </div>
      </div>
      {hidden ? (
        <button
          type="button"
          onClick={reveal}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-[13px] font-semibold ring-1 ring-border"
        >
          <Eye className="h-4 w-4" /> Zeigen
        </button>
      ) : (
        <span
          className={cn(
            "shrink-0 font-display text-xl font-bold tabular",
            r.points ? "text-primary" : "text-muted-foreground",
          )}
        >
          +{r.points}
        </span>
      )}
    </div>
  );
}

/** Punkte, Quote, Anzahl – nur aus aufgedeckten Spielen (sonst verraten sie Ergebnisse). */
function Stats({ tips }: { tips: Record<string, Prediction> }) {
  const { matches } = useTournament();
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => s.revealed);
  const summary = useMemo(() => {
    const visible = spoiler ? matches.filter((m) => revealed[m.id]) : matches;
    return { ...summarize(tips, visible), total: summarize(tips, matches).total };
  }, [tips, matches, spoiler, revealed]);
  return (
    <div className="mb-6 grid grid-cols-3 divide-x divide-border/70 rounded-2xl border border-border bg-card py-3">
      {[
        { label: "Punkte", value: summary.points, accent: true },
        { label: "Quote", value: summary.rated ? `${Math.round(summary.hitRate * 100)}%` : "–" },
        { label: "Getippt", value: summary.total },
      ].map((s) => (
        <div key={s.label} className="text-center">
          <div
            className={cn(
              "font-display text-[28px] font-bold leading-none tabular",
              s.accent && "text-primary",
            )}
          >
            {s.value}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

type Filter = "open" | "mine";

/**
 * Alles zum Tippen für genau einen Kontext (allein, eine Runde oder die
 * Vorschau-Runde): Europameister-Tipp, offene Spiele, laufende und
 * ausgewertete Tipps.
 */
export function TipPanel({ ctx, showStats = true }: { ctx: TipContext; showStats?: boolean }) {
  const { matches } = useTournament();
  const now = useNow();
  const prefs = usePrefs();
  const tips = useContextTips(ctx);
  const [filter, setFilter] = useState<Filter>("open");
  const [allRated, setAllRated] = useState(false);

  // In einer Runde zählen alle Spiele – dort gibt es keinen Filter „Meine Teams“
  // und alle offenen Spiele stehen zum Tippen da.
  const inRound = ctx.kind !== "solo";
  const tippable = useMemo(() => {
    const list = matches.filter((m) => canPredict(m, now) && m.home && m.away);
    if (inRound) return list;
    const filtered = filter === "mine" ? list.filter((m) => recommend(m, prefs).mine) : list;
    return filtered.slice(0, 12);
  }, [matches, now, filter, prefs, inRound]);
  const openCount = useMemo(
    () => matches.filter((m) => canPredict(m, now) && m.home && m.away && !tips[m.id]).length,
    [matches, now, tips],
  );
  const rated = useMemo(
    () =>
      matches
        .filter((m) => tips[m.id] && m.status === "finished" && m.score)
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc)),
    [matches, tips],
  );
  const pending = useMemo(
    () => matches.filter((m) => tips[m.id] && !canPredict(m, now) && m.status !== "finished"),
    [matches, tips, now],
  );
  const anyTeams = matches.some((m) => m.home && m.away);

  return (
    <>
      {showStats && <Stats tips={tips} />}
      <ChampionTipCard context={ctx} />

      {!anyTeams ? (
        <EmptyState
          icon={<Target />}
          title="Tippen startet nach der Auslosung"
          text="Sobald die Paarungen feststehen, kannst du hier jedes Spiel bis zum Anpfiff tippen."
        />
      ) : (
        <>
          {ctx.kind === "group" && <CopyTips ctx={ctx} tips={tips} />}
          <Section
            title="Spiele tippen"
            icon={<Target />}
            hint={
              openCount > 0
                ? `${openCount} ${openCount === 1 ? "Spiel" : "Spiele"} noch ohne Tipp`
                : undefined
            }
            action={
              !inRound && (
                <Segmented<Filter>
                  size="sm"
                  className="w-40"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "open", label: "Alle" },
                    { value: "mine", label: "Meine Teams" },
                  ]}
                />
              )
            }
          >
            {tippable.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="Nichts mehr offen"
                text="Alle anstehenden Spiele sind getippt oder noch ohne Paarung."
              />
            ) : (
              <div className="space-y-5">
                {byDay(tippable, now, prefs.timeZone).map((d) => (
                  <div key={d.key}>
                    <h3 className="mb-2 text-[15px] font-bold">{d.label}</h3>
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      {d.items.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-2xl border border-border bg-card px-4 py-3"
                        >
                          <MatchHead m={m} day={false} />
                          <div className="mt-2.5">
                            <PredictionEditor match={m} context={ctx} showContext={false} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {pending.length > 0 && (
            <Section title="Läuft gerade" count={pending.length}>
              <div className="space-y-2">
                {pending.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <MatchHead m={m} />
                    </div>
                    <span className="shrink-0 rounded-lg bg-muted px-2 py-0.5 font-display text-[17px] font-bold tabular">
                      {tips[m.id].home}:{tips[m.id].away}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {rated.length > 0 && (
            <Section title="Ausgewertet" icon={<Trophy />} count={rated.length}>
              <div className="space-y-2">
                {(allRated ? rated : rated.slice(0, 3)).map((m) => (
                  <RatedRow key={m.id} m={m} tip={tips[m.id]} />
                ))}
              </div>
              {rated.length > 3 && (
                <button
                  type="button"
                  onClick={() => setAllRated((v) => !v)}
                  className="mt-2 inline-flex h-10 items-center gap-1 text-[14px] font-medium text-primary"
                >
                  {allRated ? "Weniger anzeigen" : `Alle ${rated.length} anzeigen`}
                  <ChevronDown className={cn("h-4 w-4", allRated && "rotate-180")} />
                </button>
              )}
            </Section>
          )}
        </>
      )}
    </>
  );
}

/** Offene Spiele nach Tagen – mit „Heute“/„Morgen“ als Überschrift. */
function byDay(list: MatchView[], now: number, tz: string) {
  const days: { key: string; label: string; items: MatchView[] }[] = [];
  for (const m of list) {
    const key = localParts(m.kickoffUtc, tz).dayKey;
    let d = days.find((x) => x.key === key);
    if (!d) {
      const rel = relativeDay(m.kickoffUtc, now, tz);
      const long = formatDayLong(m.kickoffUtc, tz);
      d = { key, label: rel ? `${rel}, ${long}` : long, items: [] };
      days.push(d);
    }
    d.items.push(m);
  }
  return days;
}

/**
 * Wer in mehreren Runden ist, muss jede einzeln tippen. Damit das nicht
 * mühsam wird: offene Tipps aus einer anderen Runde mit einem Knopf
 * übernehmen (vorhandene Tipps hier bleiben unverändert).
 */
function CopyTips({ ctx, tips }: { ctx: TipContext; tips: Record<string, Prediction> }) {
  const { matches } = useTournament();
  const now = useNow();
  const groups = useAppStore((s) => s.tipGroups);
  const groupTips = useAppStore((s) => s.groupTips);
  const [busy, setBusy] = useState<string | null>(null);
  const open = matches.filter((m) => m.home && m.away && canPredict(m, now) && !tips[m.id]);
  const sources = groups
    .filter((g) => g.id !== ctx.id)
    .map((g) => ({
      g,
      list: open
        .filter((m) => groupTips[g.id]?.[m.id])
        .map((m) => ({ match_id: m.id, ...pick(groupTips[g.id][m.id]) })),
    }))
    .filter((x) => x.list.length > 0)
    .slice(0, 3);
  if (sources.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Copy className="h-4 w-4 text-primary" /> Schon in einer anderen Runde getippt?
      </p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        Jede Runde wird einzeln getippt. Du kannst deine Tipps von dort übernehmen und danach hier
        noch ändern.
      </p>
      <div className="mt-3 space-y-2">
        {sources.map(({ g, list }) => (
          <button
            key={g.id}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(g.id);
              try {
                await importTips(ctx.id, list);
                const store = useAppStore.getState();
                const now2 = Date.now();
                store.setGroupTips(ctx.id, {
                  ...Object.fromEntries(
                    list.map((t) => [t.match_id, { ...pick(t), createdAt: now2 }]),
                  ),
                  ...(store.groupTips[ctx.id] ?? {}),
                });
                toast.success(`${list.length} ${list.length === 1 ? "Tipp" : "Tipps"} übernommen`, {
                  description: `aus „${g.name}“ für „${ctx.label}“`,
                });
              } catch (err) {
                toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
              } finally {
                setBusy(null);
              }
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 text-[15px] font-semibold text-primary disabled:opacity-50"
          >
            {busy === g.id && <Loader2 className="h-4 w-4 animate-spin" />}
            {list.length} {list.length === 1 ? "Tipp" : "Tipps"} aus „{g.name}“ übernehmen
          </button>
        ))}
      </div>
    </div>
  );
}

function pick(t: { home: number; away: number }) {
  return { home: t.home, away: t.away };
}
