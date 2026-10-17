import { resolveTournament } from "@/domain/resolve";
import type { FixturePatch, ResultRecord, Score } from "@/domain/types";
import { getNation } from "@/tournament/nations";
import { FIXTURES, matchId } from "@/tournament/schedule";

/**
 * VORSCHAU-MODUS
 *
 * Eine frei erfundene Auslosung plus simulierte Ergebnisse, damit man die App
 * schon heute im „Turnier-Zustand“ ausprobieren kann. Wird in der App überall
 * deutlich als DEMO markiert und nie mit echten Daten vermischt.
 */
export const DEMO_DRAW: Record<string, string> = {
  A1: "WAL",
  A2: "POR",
  A3: "AUT",
  A4: "CZE",
  B1: "ENG",
  B2: "NED",
  B3: "SUI",
  B4: "GEO",
  C1: "ESP",
  C2: "ITA",
  C3: "NOR",
  C4: "SRB",
  D1: "FRA",
  D2: "BEL",
  D3: "UKR",
  D4: "SVN",
  E1: "IRL",
  E2: "GER",
  E3: "TUR",
  E4: "HUN",
  F1: "SCO",
  F2: "CRO",
  F3: "DEN",
  F4: "POL",
};

export type DemoScenario = "drawn" | "group" | "knockout" | "final" | "done";

export const DEMO_SCENARIOS: { id: DemoScenario; label: string; hint: string; now: string }[] = [
  {
    id: "drawn",
    label: "Nach der Auslosung",
    hint: "Teams stehen fest, noch kein Spiel gespielt",
    now: "2028-05-20T10:00:00Z",
  },
  {
    id: "group",
    label: "Gruppenphase live",
    hint: "20. Juni, 3. Spieltag läuft gerade",
    now: "2028-06-20T17:05:00Z",
  },
  {
    id: "knockout",
    label: "Achtelfinale",
    hint: "26. Juni, Achtelfinale läuft",
    now: "2028-06-26T20:10:00Z",
  },
  {
    id: "final",
    label: "Finaltag",
    hint: "9. Juli, kurz vor dem Finale",
    now: "2028-07-09T14:00:00Z",
  },
  {
    id: "done",
    label: "Nach dem Finale",
    hint: "Turnier vorbei, Europameister steht fest",
    now: "2028-07-10T09:00:00Z",
  },
];

export function demoStart(scenario: DemoScenario): number {
  const meta = DEMO_SCENARIOS.find((s) => s.id === scenario) ?? DEMO_SCENARIOS[1];
  return Date.parse(meta.now);
}

/** Deterministischer Zufall (mulberry32), damit die Demo immer gleich aussieht. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function goals(rand: () => number, expected: number): number {
  // Poisson-Ziehung (Knuth)
  const L = Math.exp(-expected);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return Math.min(k - 1, 6);
}

const strength = (code: string | null) => {
  const tier = getNation(code)?.tier ?? 3;
  return tier === 1 ? 1.75 : tier === 2 ? 1.25 : 0.9;
};

function simulate(num: number, home: string | null, away: string | null, ko: boolean) {
  const rand = rng(num * 7919 + 2028);
  const sh = strength(home);
  const sa = strength(away);
  const score: Score = {
    home: goals(rand, (1.3 * sh) / sa),
    away: goals(rand, (1.3 * sa) / sh),
  };
  let penalties: Score | undefined;
  if (ko && score.home === score.away) {
    const a = 3 + Math.floor(rand() * 3);
    let b = 3 + Math.floor(rand() * 3);
    if (a === b) b = a - 1;
    penalties = { home: a, away: b };
  }
  return { score, penalties };
}

export type DemoData = {
  draw: Record<string, string>;
  results: Record<string, ResultRecord>;
  patches: Record<string, FixturePatch>;
  now: number;
};

/**
 * Baut Ergebnisse für alle Spiele, die zum simulierten Zeitpunkt beendet sind
 * bzw. gerade laufen. K.-o.-Spiele werden rundenweise simuliert, damit die
 * Sieger korrekt in die nächste Runde wandern.
 */
export function buildDemo(scenario: DemoScenario, elapsedMs = 0): DemoData {
  const now = demoStart(scenario) + Math.max(0, elapsedMs);
  const draw = DEMO_DRAW;
  const results: Record<string, ResultRecord> = {};
  // In der Demo gelten die vorläufigen Anstoßzeiten als bestätigt.
  const patches: Record<string, FixturePatch> = {};
  for (const f of FIXTURES) patches[matchId(f.number)] = { kickoffUtc: f.kickoffUtc };

  const ordered = [...FIXTURES].sort((a, b) => a.number - b.number);
  for (const f of ordered) {
    const kickoff = Date.parse(f.kickoffUtc);
    if (kickoff > now) continue;
    const state = resolveTournament({ fixtures: FIXTURES, draw, results, patches, now });
    const view = state.matches.find((m) => m.number === f.number)!;
    if (!view.home || !view.away) continue;
    const { score, penalties } = simulate(f.number, view.home, view.away, f.stage !== "group");
    const elapsed = (now - kickoff) / 60_000;
    const id = matchId(f.number);
    if (elapsed >= (f.stage === "group" ? 112 : penalties ? 150 : 112)) {
      results[id] = { status: "finished", score, penalties, source: "demo", updatedAt: now };
    } else {
      const share = Math.min(1, elapsed / 95);
      results[id] = {
        status: "live",
        score: { home: Math.floor(score.home * share), away: Math.floor(score.away * share) },
        minute: Math.max(1, Math.round(elapsed)),
        phase: elapsed < 47 ? "first" : elapsed < 62 ? "half" : "second",
        source: "demo",
        updatedAt: now,
      };
    }
  }
  return { draw, results, patches, now };
}
