import { Check, ChevronRight, Eye, Moon } from "lucide-react";
import { LiveDot } from "@/components/common/LiveDot";
import { phaseLabel } from "@/components/match/phase";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { formatDayShort, formatTime, relativeDay, type Fit } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/store/app-store";
import { useNow } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { getTvInfo } from "@/tournament/tv";

/** Klartext zur Zeitfenster-Einstufung – ohne Fachbegriffe. */
export function FitNote({ fit, className }: { fit: Fit; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        fit === "full" ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {fit === "none" ? <Moon className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      {fit === "full"
        ? "Passt in deine Zeit"
        : fit === "partial"
          ? "Teilweise in deiner Zeit"
          : "Außerhalb deiner Zeit"}
    </span>
  );
}

/**
 * Eine Zeile pro Spiel für die Startseite: links Tag und Uhrzeit, in der Mitte
 * die beiden Teams, darunter eine Zeile Klartext (Zeitfenster bzw. Sender).
 * Mehrere Zeilen werden in einer gemeinsamen Karte untereinander gezeigt.
 */
export function MatchRow({ match: m, fit }: { match: MatchView; fit?: Fit }) {
  const tz = useTimeZone();
  const now = useNow();
  const openMatch = useUi((s) => s.openMatch);
  const { hidden, reveal } = useSpoiler(m);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const live = m.status === "live";
  const finished = m.status === "finished";
  const showScore = (live || finished) && !!m.score;

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => openMatch(m.id)}
        aria-label={`${a.name} gegen ${b.name}, Details öffnen`}
        className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="w-[4.5rem] shrink-0">
          {live ? (
            <>
              <div className="flex items-center gap-1.5 text-[13px] font-bold uppercase text-live">
                <LiveDot /> Live
              </div>
              <div className="whitespace-nowrap text-[12px] text-muted-foreground">
                {phaseLabel(m)}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] text-muted-foreground">
                {relativeDay(m.kickoffUtc, now, tz) ?? formatDayShort(m.kickoffUtc, tz)}
              </div>
              <div className="font-display text-[22px] font-semibold leading-none tabular">
                {formatTime(m.kickoffUtc, tz)}
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {[
            { t: a, s: m.score?.home },
            { t: b, s: m.score?.away },
          ].map(({ t, s }, i) => (
            <div key={i} className="flex h-7 items-center gap-2.5">
              <Flag flag={t.flag} size="sm" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[16px]",
                  t.placeholder ? "text-muted-foreground" : "font-semibold",
                )}
              >
                {t.name}
              </span>
              {showScore && !hidden && (
                <span
                  className={cn(
                    "font-display text-[22px] font-semibold leading-none tabular",
                    live && "text-live",
                  )}
                >
                  {s}
                </span>
              )}
            </div>
          ))}
          {!showScore && (
            <div className="mt-1 text-[13px]">
              {fit ? (
                <FitNote fit={fit} />
              ) : (
                <span className="text-muted-foreground">{getTvInfo(m).label}</span>
              )}
            </div>
          )}
          {finished && m.penalties && !hidden && (
            <div className="mt-1 text-[13px] text-muted-foreground">
              Elfmeterschießen {m.penalties.home}:{m.penalties.away}
            </div>
          )}
        </div>
        {!(showScore && hidden) && (
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
        )}
      </button>
      {showScore && hidden && (
        <button
          type="button"
          onClick={reveal}
          aria-label="Ergebnis zeigen"
          className="mr-3 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-3 py-2 text-[13px] font-semibold ring-1 ring-border"
        >
          <Eye className="h-4 w-4" /> Zeigen
        </button>
      )}
    </div>
  );
}

/** Gemeinsame Karte für mehrere {@link MatchRow}s. */
export function MatchList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
