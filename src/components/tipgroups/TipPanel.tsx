import { Copy, Loader2, Target, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { canPredict, CHAMPION_BONUS, summarize, type Prediction } from "@/domain/predictions";
import { useContextChampion, useContextTips, type TipContext } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { importTips, TipError } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { MatchdayTips } from "./MatchdayTips";
import { ChampionTipCard } from "./TipGroups";

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
        { label: "Treffer", value: summary.rated ? `${Math.round(summary.hitRate * 100)}%` : "–" },
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

/**
 * Alles zum Tippen für genau einen Kontext (allein, eine Runde oder eine
 * Vorschau-Runde): Europameister-Tipp und die Spiele nach Spieltagen.
 */
export function TipPanel({ ctx, showStats = true }: { ctx: TipContext; showStats?: boolean }) {
  const { matches } = useTournament();
  const tips = useContextTips(ctx);
  const anyTeams = matches.some((m) => m.home && m.away);

  return (
    <>
      {showStats && <Stats tips={tips} />}
      <BonusHint ctx={ctx} />
      {!anyTeams ? (
        <EmptyState
          icon={<Target />}
          title="Tippen startet nach der Auslosung"
          text="Sobald die Paarungen feststehen, kannst du hier jedes Spiel bis zum Anpfiff tippen."
          className="mb-6"
        />
      ) : (
        <>
          {ctx.kind !== "solo" && <CopyTips ctx={ctx} tips={tips} />}
          <MatchdayTips ctx={ctx} matches={matches} tips={tips} />
        </>
      )}
      {/* Bonustipp unter den Spielen – oben stehen die Spieltage im Mittelpunkt. */}
      <h2
        id="bonustipp"
        className="mb-2 scroll-mt-24 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      >
        Bonustipp
      </h2>
      <ChampionTipCard context={ctx} />
    </>
  );
}

/**
 * Erinnerung oben: Europameister noch nicht getippt. Nur bis zum
 * Eröffnungsspiel und nur, solange in diesem Kontext kein Tipp gespeichert ist.
 */
function BonusHint({ ctx }: { ctx: TipContext }) {
  const champion = useContextChampion(ctx);
  const { matches } = useTournament();
  const now = useNow();
  const opener = matches.find((m) => m.number === 1);
  if (champion || !opener || now >= Date.parse(opener.kickoffUtc)) return null;
  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById("bonustipp")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-left"
    >
      <Trophy className="h-5 w-5 shrink-0 text-gold" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">Bonustipp noch offen</span>
        <span className="block text-[12.5px] text-muted-foreground">
          Wer wird Europameister? +{CHAMPION_BONUS} Punkte – nur bis zum Eröffnungsspiel.
        </span>
      </span>
      <span className="shrink-0 text-[14px] font-semibold text-primary">Tippen</span>
    </button>
  );
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
  // (tipGroups enthält nur Runden, in denen man angenommen ist.)
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
