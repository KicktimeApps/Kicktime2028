import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck2, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterChip } from "@/components/common/Chip";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { MatchCard } from "@/components/match/MatchCard";
import { teamDisplay } from "@/domain/labels";
import { recommend } from "@/domain/recommend";
import { formatDate, localParts, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { cn } from "@/lib/utils";
import { useMatchStore, useNow, useTournament } from "@/store/match-store";
import { useAppStore } from "@/store/app-store";
import { STAGE_LABEL, TOURNAMENT } from "@/tournament/config";
import type { Stage } from "@/tournament/types";

export const Route = createFileRoute("/spielplan")({
  head: () => ({ meta: [{ title: `Spielplan ${TOURNAMENT.name} – alle 51 Spiele | KickTime` }] }),
  component: Schedule,
});

type Scope = "all" | "mine" | "fits";
type Phase = "all" | `group-${string}` | Exclude<Stage, "group">;

function Schedule() {
  const { matches } = useTournament();
  const prefs = usePrefs();
  const now = useNow();
  const [scope, setScope] = useState<Scope>("all");
  const [phase, setPhase] = useState<Phase>("all");
  const [q, setQ] = useState("");
  const scrolled = useRef(false);
  // Erst scrollen, wenn der Match-Store den (Demo-)Zustand übernommen hat.
  const synced = useMatchStore((s) => s.demo.enabled) === useAppStore((s) => s.demo.enabled);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return matches.filter((m) => {
      if (phase !== "all") {
        if (phase.startsWith("group-")) {
          if (m.stage !== "group" || m.group !== phase.slice(6)) return false;
        } else if (m.stage !== phase) return false;
      }
      if (scope !== "all") {
        const r = recommend(m, prefs);
        if (scope === "mine" && !r.mine) return false;
        if (scope === "fits" && r.fit === "none") return false;
      }
      if (query) {
        const hay = [
          teamDisplay(m.home, m.slotHome).name,
          teamDisplay(m.away, m.slotAway).name,
          m.venue.city,
          m.venue.name,
          `spiel ${m.number}`,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [matches, scope, phase, q, prefs]);

  const days = useMemo(() => {
    const map = new Map<string, MatchView[]>();
    for (const m of filtered) {
      const key = localParts(m.kickoffUtc, prefs.timeZone).dayKey;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [filtered, prefs.timeZone]);

  // Beim ersten Öffnen zum heutigen bzw. nächsten Spieltag springen.
  useEffect(() => {
    if (scrolled.current || days.length === 0 || !synced) return;
    const today = localParts(now, prefs.timeZone).dayKey;
    const target = days.find(([k]) => k >= today);
    if (!target || target === days[0]) {
      scrolled.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      document.getElementById(`day-${target[0]}`)?.scrollIntoView({ block: "start" });
      scrolled.current = true;
    }, 50);
    return () => window.clearTimeout(t);
  }, [days, now, prefs.timeZone, synced]);

  const phases: { value: Phase; label: string }[] = [
    { value: "all", label: "Alle Runden" },
    ...TOURNAMENT.groups.map((g) => ({ value: `group-${g}` as Phase, label: `Gruppe ${g}` })),
    ...(["r16", "qf", "sf", "final"] as const).map((s) => ({
      value: s as Phase,
      label: STAGE_LABEL[s],
    })),
  ];

  return (
    <div>
      <PageHeader
        eyebrow={TOURNAMENT.name}
        title="Spielplan"
        subtitle={`${matches.length} Spiele · Zeiten in deiner Zeitzone`}
      />

      <div className="sticky top-[var(--top-offset)] z-20 -mx-4 mb-4 border-b border-border/60 bg-background px-4 pb-3 pt-2 md:mx-0 md:rounded-b-2xl md:px-0">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Team, Stadt oder Stadion …"
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Suche leeren"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <div className="scrollbar-none -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <FilterChip active={scope === "all"} onClick={() => setScope("all")}>
            Alle
          </FilterChip>
          <FilterChip
            active={scope === "mine"}
            onClick={() => setScope(scope === "mine" ? "all" : "mine")}
          >
            <Star /> Meine Spiele
          </FilterChip>
          <FilterChip
            active={scope === "fits"}
            onClick={() => setScope(scope === "fits" ? "all" : "fits")}
          >
            <CalendarCheck2 /> Passt in meine Zeit
          </FilterChip>
          <span className="mx-1 w-px shrink-0 bg-border" />
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as Phase)}
            aria-label="Runde filtern"
            className={cn(
              "h-8 shrink-0 rounded-full border bg-card px-3 text-[13px] font-medium outline-none",
              phase !== "all"
                ? "border-primary/50 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {phases.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="Keine Spiele gefunden"
          text={
            scope === "mine"
              ? "Zu deinen Teams gibt es (noch) keine Spiele – die Auslosung folgt."
              : "Passe Suche oder Filter an."
          }
        />
      ) : (
        <div className="space-y-6">
          {days.map(([key, list]) => {
            const rel = relativeDay(list[0].kickoffUtc, now, prefs.timeZone);
            return (
              <section key={key} id={`day-${key}`} className="scroll-mt-44 md:scroll-mt-32">
                <h2 className="mb-2.5 flex items-baseline gap-2">
                  <span className="font-display text-xl font-bold uppercase tracking-wide">
                    {rel ?? formatDate(list[0].kickoffUtc, prefs.timeZone).split(",")[0]}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatDate(list[0].kickoffUtc, prefs.timeZone).replace(/^[^,]+, /, "")}
                  </span>
                </h2>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {list.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
