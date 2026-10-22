import { ChevronRight } from "lucide-react";
import { LiveDot } from "@/components/common/LiveDot";
import { phaseShort } from "@/components/match/phase";
import { ScoreDigit } from "@/components/match/GoalScore";
import { useGoalFlash } from "@/components/match/useGoalFlash";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui-store";

/** Ein laufendes Spiel in einer Zeile – antippen öffnet alle Infos. */
function LiveLine({ m }: { m: MatchView }) {
  const openMatch = useUi((s) => s.openMatch);
  const { hidden } = useSpoiler(m);
  const flash = useGoalFlash(m, hidden);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
      aria-label={`Live: ${a.name} gegen ${b.name}, Details öffnen`}
      className={cn(
        "flex h-12 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-live/10",
        flash && "goal-flash",
      )}
    >
      <span className="w-12 shrink-0 text-[12px] font-semibold text-live">{phaseShort(m)}</span>
      <Flag flag={a.flag} size="sm" />
      <span className="min-w-0 flex-1 truncate text-right text-[15px] font-semibold">{a.name}</span>
      <span
        className={cn(
          "w-12 shrink-0 text-center font-display text-[20px] font-bold tabular text-live",
          hidden && "text-muted-foreground",
        )}
      >
        {hidden || !m.score ? (
          "–:–"
        ) : (
          <>
            <ScoreDigit value={m.score.home} />:<ScoreDigit value={m.score.away} />
          </>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{b.name}</span>
      <Flag flag={b.flag} size="sm" />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

/** Kompakte Live-Leiste für die Startseite. */
export function LiveBar({ matches }: { matches: MatchView[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-live/40 bg-live/5">
      <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-live">
        <LiveDot /> Jetzt live
      </div>
      <div className="divide-y divide-live/15">
        {matches.map((m) => (
          <LiveLine key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}
