import { Trophy } from "lucide-react";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { slotShort, teamDisplay } from "@/domain/labels";
import { winnerOf } from "@/domain/resolve";
import { formatDayShort, formatTime } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useAppStore, useTimeZone } from "@/store/app-store";
import { useUi } from "@/store/ui-store";
import { BRACKET_LAYOUT } from "@/tournament/bracket";

function BracketMatch({ m, side }: { m: MatchView; side: "left" | "right" | "final" }) {
  const tz = useTimeZone();
  const openMatch = useUi((s) => s.openMatch);
  const favorites = useAppStore((s) => s.favorites);
  const { hidden } = useSpoiler(m);
  const winner = hidden ? null : winnerOf(m);
  const rows = [
    { code: m.home, slot: m.slotHome, score: m.score?.home, pen: m.penalties?.home },
    { code: m.away, slot: m.slotAway, score: m.score?.away, pen: m.penalties?.away },
  ];
  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
      className={cn(
        "relative w-full rounded-xl border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/50",
        m.status === "live"
          ? "border-live/60"
          : side === "final"
            ? "border-gold/50"
            : "border-border",
        // Verbindungslinien
        side !== "final" &&
          "after:absolute after:top-1/2 after:h-px after:w-1.5 after:bg-border after:content-['']",
        side === "left" && "after:-right-1.5",
        side === "right" && "after:-left-1.5",
      )}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>#{m.number}</span>
        <span className="tabular">
          {m.status === "live" ? (
            <span className="font-bold text-live">LIVE</span>
          ) : (
            `${formatDayShort(m.kickoffUtc, tz).slice(3)} ${formatTime(m.kickoffUtc, tz)}`
          )}
        </span>
      </div>
      {rows.map((r, i) => {
        const t = teamDisplay(r.code, r.slot);
        const lost = !!winner && r.code !== winner;
        return (
          <div key={i} className="flex h-6 items-center gap-1.5">
            <Flag flag={t.flag} size="xs" muted={lost} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12.5px]",
                t.placeholder ? "text-muted-foreground" : "font-semibold",
                lost && "font-normal text-muted-foreground",
                r.code && favorites.includes(r.code) && "text-gold",
              )}
              title={t.name}
            >
              {t.placeholder ? slotShort(r.slot) : t.short}
            </span>
            {m.status !== "scheduled" && r.score !== undefined && (
              <span
                className={cn(
                  "font-display text-[15px] font-bold tabular",
                  hidden && "blur-[4px]",
                  lost && "text-muted-foreground",
                )}
              >
                {r.score}
                {r.pen !== undefined && !hidden && (
                  <sup className="text-[9px] font-medium">{r.pen}</sup>
                )}
              </span>
            )}
          </div>
        );
      })}
    </button>
  );
}

function Column({
  title,
  ids,
  matches,
  side,
}: {
  title: string;
  ids: readonly number[];
  matches: MatchView[];
  side: "left" | "right" | "final";
}) {
  return (
    <div className="flex w-[8.75rem] shrink-0 flex-col">
      <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {ids.map((n) => {
          const m = matches.find((x) => x.number === n);
          return m ? <BracketMatch key={n} m={m} side={side} /> : null;
        })}
      </div>
    </div>
  );
}

/** Symmetrischer K.-o.-Baum: links und rechts nach innen bis zum Finale. */
export function Bracket({ matches }: { matches: MatchView[] }) {
  const L = BRACKET_LAYOUT.left;
  const R = BRACKET_LAYOUT.right;
  const final = matches.find((m) => m.number === BRACKET_LAYOUT.final);
  const champion = final ? winnerOf(final) : null;
  const { hidden } = useSpoiler(final ?? { id: "", status: "scheduled", score: undefined });
  const champ = champion && !hidden ? teamDisplay(champion, "") : null;
  return (
    <div className="scrollbar-none -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex min-h-[640px] min-w-max gap-3">
        <Column title="Achtelfinale" ids={L.r16} matches={matches} side="left" />
        <Column title="Viertelfinale" ids={L.qf} matches={matches} side="left" />
        <Column title="Halbfinale" ids={L.sf} matches={matches} side="left" />
        <div className="flex w-[10rem] shrink-0 flex-col items-stretch justify-center gap-4">
          <div className="text-center">
            <Trophy
              className={cn(
                "mx-auto h-10 w-10",
                champ ? "fill-gold/30 text-gold" : "text-muted-foreground/40",
              )}
            />
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              Finale · Wembley
            </div>
            {champ && (
              <div className="mt-2 flex items-center justify-center gap-2 font-display text-xl font-bold uppercase">
                <Flag flag={champ.flag} size="sm" /> {champ.short}
              </div>
            )}
          </div>
          {final && <BracketMatch m={final} side="final" />}
        </div>
        <Column title="Halbfinale" ids={R.sf} matches={matches} side="right" />
        <Column title="Viertelfinale" ids={R.qf} matches={matches} side="right" />
        <Column title="Achtelfinale" ids={R.r16} matches={matches} side="right" />
      </div>
    </div>
  );
}
