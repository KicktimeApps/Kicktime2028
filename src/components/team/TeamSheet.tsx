import { Check, Star, Trophy } from "lucide-react";
import { useMemo } from "react";
import { Chip } from "@/components/common/Chip";
import { MatchCard } from "@/components/match/MatchCard";
import { GroupTableCard } from "@/components/tournament/GroupTableCard";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useTeamStatuses } from "@/hooks/useTeamStatuses";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { teamMarkOf, useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { getNation } from "@/tournament/nations";
import { Flag } from "./Flag";
import { statusChip } from "./statusChip";

export function TeamSheet() {
  const code = useUi((s) => s.teamCode);
  const close = useUi((s) => s.closeTeam);
  return (
    <Drawer open={!!code} onOpenChange={(v) => !v && close()} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl border-border bg-background">
        {code && <TeamBody code={code} />}
      </DrawerContent>
    </Drawer>
  );
}

function TeamBody({ code }: { code: string }) {
  const nation = getNation(code);
  const statuses = useTeamStatuses();
  const status = statuses.get(code);
  const tournament = useTournament();
  const mark = useAppStore((s) => teamMarkOf(s, code));
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const setTeamMark = useAppStore((s) => s.setTeamMark);
  const matches = useMemo(
    () => tournament.matches.filter((m) => m.home === code || m.away === code),
    [tournament, code],
  );
  const table = status?.group ? tournament.tables.find((t) => t.group === status.group) : undefined;
  if (!nation) return null;

  return (
    <div className="overflow-y-auto px-4 pb-8 pt-4">
      <div className="flex items-center gap-4">
        <Flag flag={nation.flag} size="xl" />
        <div className="min-w-0">
          <DrawerTitle className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            {nation.name}
          </DrawerTitle>
          <DrawerDescription asChild>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {statusChip(status)}
              {nation.host && <Chip tone="outline">Co-Gastgeber</Chip>}
            </div>
          </DrawerDescription>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {(["favorite", "interesting"] as const).map((k) => {
          const active = mark === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptics.tap();
                setTeamMark(code, active ? null : k);
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors",
                active
                  ? k === "favorite"
                    ? "border-gold/60 bg-gold/15 text-gold"
                    : "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "favorite" ? (
                <Star className={cn("h-4 w-4", active && "fill-current")} />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {k === "favorite"
                ? active
                  ? "Favorit"
                  : "Als Favorit"
                : active
                  ? "Interessant"
                  : "Interessant"}
            </button>
          );
        })}
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          EM-Historie
        </h3>
        {nation.euroTitles.length > 0 ? (
          <div className="flex items-center gap-3">
            <div className="flex">
              {nation.euroTitles.map((y) => (
                <Trophy key={y} className="-mr-1 h-6 w-6 fill-gold/30 text-gold" />
              ))}
            </div>
            <div>
              <div className="font-semibold">{nation.euroTitles.length}× Europameister</div>
              <div className="text-[13px] text-muted-foreground">
                {nation.euroTitles.join(", ")}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">
            Noch kein EM-Titel – vielleicht ja 2028?
          </p>
        )}
      </section>

      {table && (
        <div className="mt-3">
          <GroupTableCard table={table} highlight={[code]} hideScores={spoiler} compact />
        </div>
      )}

      <section className="mt-4">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Spiele
        </h3>
        {matches.length > 0 ? (
          <div className="space-y-2.5">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} showDate />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-subtle px-4 py-3 text-[13.5px] text-muted-foreground">
            {status?.phase === "qualifying"
              ? "Die Spiele erscheinen hier automatisch, sobald sich das Team qualifiziert hat und die Auslosung feststeht."
              : "Keine Spiele bei dieser EM."}
          </p>
        )}
      </section>
    </div>
  );
}
