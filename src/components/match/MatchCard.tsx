import { Clock3, Eye, Star, Tv } from "lucide-react";
import { LiveDot } from "@/components/common/LiveDot";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { formatDayShort, formatTime, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useAppStore, useTimeZone } from "@/store/app-store";
import { useNow } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { STAGE_LABEL } from "@/tournament/config";
import { getTvInfo } from "@/tournament/tv";
import { MatchActions } from "./MatchActions";
import { phaseLabel } from "./phase";
import { useSpoiler } from "./useSpoiler";

/**
 * Einheitliche Spielkarte für alle Listen: Zeit, Teams, Ergebnis und eine
 * schmale Zeile mit Runde, Sender, Erinnern und Vormerken.
 */
export function MatchCard({
  match: m,
  showDate = false,
  actions = true,
  className,
}: {
  match: MatchView;
  showDate?: boolean;
  actions?: boolean;
  className?: string;
}) {
  const tz = useTimeZone();
  const now = useNow();
  const openMatch = useUi((s) => s.openMatch);
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);
  const { hidden, reveal } = useSpoiler(m);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const live = m.status === "live";
  const finished = m.status === "finished";
  const tv = getTvInfo(m);
  const rel = showDate ? relativeDay(m.kickoffUtc, now, tz) : null;
  // Bei aktivem Spoilerschutz darf auch die Optik (ausgegrauter Verlierer)
  // nichts verraten.
  const winnerSide =
    finished && m.score && !hidden
      ? m.score.home !== m.score.away
        ? m.score.home > m.score.away
          ? "home"
          : "away"
        : m.penalties
          ? m.penalties.home > m.penalties.away
            ? "home"
            : "away"
          : null
      : null;

  const markOf = (code: string | null) =>
    code && favorites.includes(code) ? "fav" : code && interesting.includes(code) ? "int" : null;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card transition-colors",
        live ? "border-live/50" : "border-border hover:border-muted-foreground/30",
        className,
      )}
    >
      {live && <div className="absolute inset-y-0 left-0 w-1 bg-live" aria-hidden />}
      <button
        type="button"
        onClick={() => openMatch(m.id)}
        className="flex w-full items-stretch gap-3 px-3.5 pt-3 pb-2.5 text-left"
        aria-label={`${a.name} gegen ${b.name}, Details öffnen`}
      >
        {/* Zeit-Spalte */}
        <div className="flex w-14 shrink-0 flex-col items-start justify-center border-r border-border/70 pr-2">
          {live ? (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-live">
                <LiveDot /> Live
              </span>
              <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {phaseLabel(m)}
              </span>
            </>
          ) : (
            <>
              {showDate && (
                <span className="text-[11px] font-medium leading-tight text-muted-foreground">
                  {rel ?? formatDayShort(m.kickoffUtc, tz)}
                </span>
              )}
              <span
                className={cn(
                  "font-display text-[22px] font-semibold leading-none tabular",
                  finished && "text-muted-foreground",
                )}
              >
                {formatTime(m.kickoffUtc, tz)}
              </span>
              {finished ? (
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.penalties && !hidden ? "n. E." : "Ende"}
                </span>
              ) : !m.kickoffConfirmed ? (
                <span
                  className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground"
                  title="Uhrzeit noch nicht offiziell"
                >
                  <Clock3 className="h-2.5 w-2.5" /> vorläufig
                </span>
              ) : null}
            </>
          )}
        </div>

        {/* Teams + Ergebnis */}
        <div className={cn("min-w-0 flex-1", hidden && "pr-24")}>
          {[
            { t: a, s: m.score?.home, p: m.penalties?.home, side: "home" as const },
            { t: b, s: m.score?.away, p: m.penalties?.away, side: "away" as const },
          ].map(({ t, s, p, side }) => {
            const mark = markOf(t.code);
            const lost = winnerSide && winnerSide !== side;
            return (
              <div key={side} className="flex h-7 items-center gap-2.5">
                <Flag flag={t.flag} size="md" muted={!!lost} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[15px]",
                    t.placeholder ? "text-muted-foreground" : "font-semibold",
                    lost && "font-medium text-muted-foreground",
                  )}
                >
                  {t.name}
                </span>
                {mark === "fav" && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Favorit" />
                )}
                {mark === "int" && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-label="Dein Team"
                  />
                )}
                {s !== undefined && m.status !== "scheduled" && !hidden && (
                  <span
                    className={cn(
                      "w-6 text-right font-display text-[22px] font-semibold leading-none tabular",
                      live && "text-live",
                      lost && "text-muted-foreground",
                    )}
                  >
                    {s}
                    {p !== undefined && (
                      <sup className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                        {p}
                      </sup>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </button>

      {hidden && (
        <button
          type="button"
          onClick={reveal}
          aria-label="Ergebnis zeigen"
          className="absolute right-3 top-[1.4rem] inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-[13px] font-semibold text-foreground ring-1 ring-border"
        >
          <Eye className="h-4 w-4" /> Zeigen
        </button>
      )}

      {/* Meta-Zeile */}
      <div className="flex items-center gap-2 border-t border-border/60 px-3.5 py-0.5">
        <div className="flex min-w-0 flex-1 items-center gap-x-2.5 text-[12.5px] text-muted-foreground">
          <span className="shrink-0 font-medium text-foreground/80">
            {m.stage === "group" ? `Gruppe ${m.group}` : STAGE_LABEL[m.stage]}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <Tv className="h-3 w-3 shrink-0" /> <span className="truncate">{tv.label}</span>
          </span>
        </div>
        {actions && <MatchActions match={m} />}
      </div>
    </article>
  );
}
