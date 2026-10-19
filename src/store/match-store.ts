import { create } from "zustand";
import { buildDemo, demoStart, type DemoScenario } from "@/demo/demo";
import { resolveTournament, type TournamentState } from "@/domain/resolve";
import { resultSignature, type FixturePatch, type ResultRecord } from "@/domain/types";
import { DRAW } from "@/tournament/draw";
import { FIXTURES } from "@/tournament/schedule";

export type LiveMeta = {
  /** "cache" = zuletzt gespeicherter Stand (offline / vor dem ersten Abruf). */
  source: "backend" | "openligadb" | "cache" | null;
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
 * Die Live-Quelle (OpenLigaDB) gibt vor. Eine Admin-Korrektur überbrückt nur,
 * wenn die Quelle hängt: Sie gilt, solange die Quelle noch genau das meldet,
 * was sie beim Speichern der Korrektur gemeldet hat. Kommt danach etwas Neues
 * (z. B. das 2:0 oder das Spielende), gilt sofort wieder die Quelle.
 *
 * Korrekturen ohne gemerkten Quellstand (ältere Server-Funktion) bleiben wie
 * bei KickTime 2026 stehen, bis sie entfernt werden; meldet die Quelle das
 * Spielende, wird mit dem korrigierten Stand beendet.
 */
export function mergeResults(
  api: Record<string, ResultRecord>,
  admin: Record<string, ResultRecord>,
): Record<string, ResultRecord> {
  const out: Record<string, ResultRecord> = { ...api };
  for (const [id, a] of Object.entries(admin)) {
    const b = api[id];
    if (a.sourceSig !== undefined) {
      if (resultSignature(b) === a.sourceSig) out[id] = a;
      continue;
    }
    if (b?.status === "finished" && a.status !== "finished") {
      out[id] = {
        ...a,
        status: "finished",
        score: a.score ?? b.score,
        penalties: a.penalties ?? b.penalties,
        phase: undefined,
        minute: undefined,
      };
    } else {
      out[id] = a;
    }
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
  // Die Uhr tickt alle 10 s. Ändert sich am Turnier dabei nichts, bleibt das
  // alte Objekt bestehen – sonst würden alle Listen und Tabellen grundlos
  // neu gezeichnet.
  let lastKey = "";
  const update = (patch: Partial<Inputs>) => {
    const next = { ...get(), ...patch };
    const tournament = compute(next);
    const key = JSON.stringify(tournament);
    if (key === lastKey) set(patch);
    else {
      lastKey = key;
      set({ ...patch, tournament });
    }
  };
  return {
    ...initial,
    tournament: compute(initial),
    live: { source: null, lastFetchAt: null, lastError: null, unmatched: 0 },
    tick: () => update({ now: Date.now() }),
    setApiData: (results, patches) =>
      update({
        // Ersetzen statt anhängen: Die Quelle liefert immer die komplette
        // Liste. So verschwinden auch verschobene oder korrigierte Einträge.
        apiResults: results,
        apiPatches: patches,
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

/** Wie useNow, aber nur minutengenau – löst höchstens einmal pro Minute aus. */
export function useNowMinute(): number {
  return useMatchStore((s) => Math.floor((s.demo.enabled ? demoNow(s) : s.now) / 60_000) * 60_000);
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
