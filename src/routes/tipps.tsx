import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Eye, Target, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Section } from "@/components/common/Section";
import { Segmented } from "@/components/common/Segmented";
import { PredictionEditor } from "@/components/match/PredictionEditor";
import { ChampionTipCard, RulesButton, TipGroupsSection } from "@/components/tipgroups/TipGroups";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import {
  canPredict,
  RESULT_LABEL,
  scorePrediction,
  summarize,
  type PredictionResult,
} from "@/domain/predictions";
import { recommend } from "@/domain/recommend";
import { formatDayShort, formatTime } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { cn } from "@/lib/utils";
import { selectPredictions, useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { TOURNAMENT } from "@/tournament/config";

export const Route = createFileRoute("/tipps")({
  head: () => ({ meta: [{ title: `Tipps ${TOURNAMENT.name} | KickTime` }] }),
  component: TipsPage,
});

const RESULT_COLOR: Record<PredictionResult, string> = {
  exact: "bg-primary",
  diff: "bg-primary/60",
  tendency: "bg-gold",
  miss: "bg-muted-foreground/30",
};

function MatchHead({ m }: { m: MatchView }) {
  const prefs = usePrefs();
  const openMatch = useUi((s) => s.openMatch);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  return (
    <button type="button" onClick={() => openMatch(m.id)} className="block w-full text-left">
      <span className="block text-[13px] text-muted-foreground tabular">
        {formatDayShort(m.kickoffUtc, prefs.timeZone)} · {formatTime(m.kickoffUtc, prefs.timeZone)}{" "}
        Uhr
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
function RatedRow({ m }: { m: MatchView }) {
  const p = useAppStore((s) => selectPredictions(s)[m.id]);
  const { hidden, reveal } = useSpoiler(m);
  const r = scorePrediction(p, m.score!, m.stage);
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
          Tipp {p.home}:{p.away}
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

type Filter = "open" | "mine";

function TipsPage() {
  const { matches } = useTournament();
  const now = useNow();
  const prefs = usePrefs();
  const predictions = useAppStore(selectPredictions);
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => s.revealed);
  const [filter, setFilter] = useState<Filter>("open");
  // Punkte und Quote nur aus aufgedeckten Spielen – sonst verraten sie Ergebnisse.
  const summary = useMemo(() => {
    const visible = spoiler ? matches.filter((m) => revealed[m.id]) : matches;
    return { ...summarize(predictions, visible), total: summarize(predictions, matches).total };
  }, [predictions, matches, spoiler, revealed]);

  const tippable = useMemo(() => {
    const list = matches.filter((m) => canPredict(m, now));
    const filtered = filter === "mine" ? list.filter((m) => recommend(m, prefs).mine) : list;
    return filtered.slice(0, 12);
  }, [matches, now, filter, prefs]);

  const rated = useMemo(
    () =>
      matches
        .filter((m) => predictions[m.id] && m.status === "finished" && m.score)
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc)),
    [matches, predictions],
  );
  const pending = useMemo(
    () =>
      matches.filter((m) => predictions[m.id] && !canPredict(m, now) && m.status !== "finished"),
    [matches, predictions, now],
  );
  const anyTeams = matches.some((m) => m.home && m.away);

  return (
    <div>
      <PageHeader
        eyebrow={TOURNAMENT.name}
        title="Tipps"
        subtitle="Tippen ist bis zum Anpfiff möglich."
        action={<RulesButton />}
      />

      <div className="mb-7 grid grid-cols-3 gap-2.5">
        {[
          { label: "Punkte", value: summary.points, accent: true },
          {
            label: "Quote",
            value: summary.rated ? `${Math.round(summary.hitRate * 100)}%` : "–",
          },
          { label: "Getippt", value: summary.total },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card px-3 py-3.5 text-center"
          >
            <div
              className={cn(
                "font-display text-4xl font-bold leading-none tabular",
                s.accent && "text-primary",
              )}
            >
              {s.value}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {summary.rated > 0 && (
        <div className="-mt-4 mb-7">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {(Object.keys(RESULT_LABEL) as PredictionResult[]).map((k) =>
              summary.counts[k] ? (
                <div
                  key={k}
                  className={RESULT_COLOR[k]}
                  style={{ width: `${(summary.counts[k] / summary.rated) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {(Object.keys(RESULT_LABEL) as PredictionResult[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", RESULT_COLOR[k])} />
                {RESULT_LABEL[k]} {summary.counts[k]}
              </span>
            ))}
          </div>
        </div>
      )}

      <ChampionTipCard />
      <TipGroupsSection />

      {!anyTeams ? (
        <EmptyState
          icon={<Target />}
          title="Tippen startet nach der Auslosung"
          text="Sobald die Paarungen feststehen, kannst du hier jedes Spiel bis zum Anpfiff tippen."
        />
      ) : (
        <>
          <Section
            title="Jetzt tippen"
            icon={<Target />}
            action={
              <Segmented<Filter>
                size="sm"
                className="w-48"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "open", label: "Alle" },
                  { value: "mine", label: "Meine" },
                ]}
              />
            }
          >
            {tippable.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="Nichts mehr offen"
                text="Alle anstehenden Spiele sind getippt oder noch ohne Paarung."
              />
            ) : (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {tippable.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-border bg-card px-4 pb-2 pt-3"
                  >
                    <MatchHead m={m} />
                    <div className="mt-2.5">
                      <PredictionEditor match={m} />
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
                      {predictions[m.id].home}:{predictions[m.id].away}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Ausgewertet" icon={<Trophy />} count={rated.length}>
            {rated.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Noch kein getipptes Spiel beendet.
              </p>
            ) : (
              <div className="space-y-2">
                {rated.map((m) => (
                  <RatedRow key={m.id} m={m} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
