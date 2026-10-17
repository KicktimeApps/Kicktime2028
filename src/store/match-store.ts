import { create } from "zustand";
import { buildDemo, demoStart, type DemoScenario } from "@/demo/demo";
import { resolveTournament, type TournamentState } from "@/domain/resolve";
import type { FixturePatch, ResultRecord } from "@/domain/types";
import { DRAW } from "@/tournament/draw";
import { FIXTURES } from "@/tournament/schedule";

export type LiveMeta = {
  source: "backend" | "openligadb" | null;
  lastFetchAt: number | null;
  lastError: string | null;
  unmatched: number;
};

type Inputs = {
  now: number;
  apiResults: Record<string, ResultRecord>;
  apiPatches: Record<string, FixturePatch>;
  adminResults: Record<string, ResultRecord>;
  demo: { enabled: boolean; scenario: DemoScenario; startedAt: number };
};

type MatchStore = Inputs & {
  tournament: TournamentState;
  live: LiveMeta;
  tick: () => void;
  setApiData: (
    results: Record<string, ResultRecord>,
    patches: Record<string, FixturePatch>,
  ) => void;
  setAdminResults: (r: Record<string, ResultRecord>) => void;
  setLiveMeta: (m: Partial<LiveMeta>) => void;
  setDemo: (d: Inputs["demo"]) => void;
};

/**
 * Admin-Korrekturen gewinnen – außer die offizielle Quelle meldet bereits das
 * Spielende oder mehr Tore (dann ist die Korrektur veraltet).
 */
export function mergeResults(
  api: Record<string, ResultRecord>,
  admin: Record<string, ResultRecord>,
): Record<string, ResultRecord> {
  const out: Record<string, ResultRecord> = { ...api };
  for (const [id, a] of Object.entries(admin)) {
    const b = api[id];
    if (b) {
      const total = (r: ResultRecord) => (r.score ? r.score.home + r.score.away : -1);
      if (b.status === "finished" && a.status !== "finished") continue;
      if (total(b) > total(a)) continue;
    }
    out[id] = a;
  }
  return out;
}

function compute(i: Inputs): TournamentState {
  if (i.demo.enabled) {
    const d = buildDemo(i.demo.scenario, i.now - i.demo.startedAt);
    return resolveTournament({
      fixtures: FIXTURES,
      draw: d.draw,
      results: d.results,
      patches: d.patches,
      now: d.now,
    });
  }
  return resolveTournament({
    fixtures: FIXTURES,
    draw: DRAW,
    results: mergeResults(i.apiResults, i.adminResults),
    patches: i.apiPatches,
    now: i.now,
  });
}

const initial: Inputs = {
  now: Date.now(),
  apiResults: {},
  apiPatches: {},
  adminResults: {},
  demo: { enabled: false, scenario: "group", startedAt: 0 },
};

export const useMatchStore = create<MatchStore>((set, get) => {
  const update = (patch: Partial<Inputs>) => {
    const next = { ...get(), ...patch };
    set({ ...patch, tournament: compute(next) });
  };
  return {
    ...initial,
    tournament: compute(initial),
    live: { source: null, lastFetchAt: null, lastError: null, unmatched: 0 },
    tick: () => update({ now: Date.now() }),
    setApiData: (results, patches) =>
      update({
        apiResults: { ...get().apiResults, ...results },
        apiPatches: { ...get().apiPatches, ...patches },
      }),
    setAdminResults: (adminResults) => update({ adminResults }),
    setLiveMeta: (m) => set({ live: { ...get().live, ...m } }),
    setDemo: (demo) => update({ demo, now: Date.now() }),
  };
});

/** Simulierte bzw. echte „Jetzt“-Zeit – im Demo-Modus die Demo-Uhr. */
export function useNow(): number {
  return useMatchStore((s) => (s.demo.enabled ? demoNow(s) : s.now));
}

function demoNow(s: Inputs): number {
  return demoStart(s.demo.scenario) + (s.now - s.demo.startedAt);
}

export function useTournament(): TournamentState {
  return useMatchStore((s) => s.tournament);
}

export function useMatch(id: string | null | undefined) {
  return useMatchStore((s) => (id ? s.tournament.matches.find((m) => m.id === id) : undefined));
}
