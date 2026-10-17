import { LiveDot } from "@/components/common/LiveDot";
import { phaseLabel } from "@/components/match/phase";
import { useSpoiler } from "@/components/match/useSpoiler";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui-store";

function LiveTile({ m }: { m: MatchView }) {
  const openMatch = useUi((s) => s.openMatch);
  const { hidden } = useSpoiler(m);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  return (
    <button
      type="button"
      onClick={() => openMatch(m.id)}
      className="min-w-[280px] flex-1 rounded-2xl border border-live/40 bg-live/8 p-3.5 text-left transition-colors hover:bg-live/12"
    >
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-live">
        <span className="flex items-center gap-1.5">
          <LiveDot /> {phaseLabel(m)}
        </span>
        <span className="font-medium normal-case tracking-normal text-muted-foreground">
          {m.stage === "group" ? `Gruppe ${m.group}` : m.venue.city}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Flag flag={a.flag} size="md" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.short}</span>
        <span
          className={cn(
            "font-display text-[26px] font-bold leading-none tabular",
            hidden && "blur-[6px]",
          )}
        >
          {m.score ? `${m.score.home}:${m.score.away}` : "–:–"}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[15px] font-semibold">
          {b.short}
        </span>
        <Flag flag={b.flag} size="md" />
      </div>
    </button>
  );
}

export function LiveStrip({ matches }: { matches: MatchView[] }) {
  const live = matches.filter((m) => m.status === "live");
  if (live.length === 0) return null;
  return (
    <div className="scrollbar-none -mx-4 mb-6 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
      {live.map((m) => (
        <LiveTile key={m.id} m={m} />
      ))}
    </div>
  );
}
