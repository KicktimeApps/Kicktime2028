import { describe, expect, it } from "vitest";
import { DEMO_DRAW } from "@/demo/demo";
import { FIXTURES } from "@/tournament/schedule";
import { buildFeed, recommend, type Prefs } from "./recommend";
import { resolveTournament } from "./resolve";
import { scorePrediction, summarize } from "./predictions";
import { DEFAULT_AVAILABILITY } from "./time";

const state = resolveTournament({
  fixtures: FIXTURES,
  draw: DEMO_DRAW,
  results: {},
  patches: {},
  now: Date.parse("2028-05-01T00:00:00Z"),
});

const prefs: Prefs = {
  favorites: ["GER"],
  interesting: ["ESP"],
  pinned: [],
  availability: DEFAULT_AVAILABILITY,
  timeZone: "Europe/Berlin",
};

describe("recommend", () => {
  it("Favoriten-Spiele bekommen Grund und hohe Punktzahl", () => {
    const m = state.matches.find((x) => x.home === "GER" || x.away === "GER")!;
    const r = recommend(m, prefs);
    expect(r.mine).toBe(true);
    expect(r.reasons).toContain("favorite");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("Top-Duell ohne eigenes Team landet höchstens als Bonus", () => {
    const m = state.matches.find((x) => x.home === "ESP" && x.away === "ITA")!;
    const r = recommend(m, { ...prefs, interesting: [] });
    expect(r.mine).toBe(false);
    expect(r.reasons).toContain("topDuel");
  });
});

describe("buildFeed", () => {
  const feed = buildFeed(state.matches, prefs);

  it("trennt passende und unpassende eigene Spiele", () => {
    const mine = [...feed.perfect, ...feed.outside];
    // GER: 3 Gruppenspiele, ESP: 3 Gruppenspiele
    expect(mine).toHaveLength(6);
    expect(feed.perfect.every((r) => r.fit !== "none")).toBe(true);
    expect(feed.outside.every((r) => r.fit === "none")).toBe(true);
  });

  it("Bonus-Spiele enthalten keine eigenen Teams", () => {
    expect(feed.bonus.every((r) => !r.mine)).toBe(true);
  });

  it("Vormerken macht ein beliebiges Spiel zum eigenen", () => {
    const other = state.matches.find((m) => m.home === "SCO")!;
    const f = buildFeed(state.matches, { ...prefs, pinned: [other.id] });
    expect([...f.perfect, ...f.outside].some((r) => r.match.id === other.id)).toBe(true);
  });
});

describe("Tipps", () => {
  it("Punkte 4/3/2/0", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 2, away: 1 }).points).toBe(4);
    expect(scorePrediction({ home: 3, away: 2 }, { home: 2, away: 1 }).points).toBe(3);
    expect(scorePrediction({ home: 1, away: 0 }, { home: 3, away: 1 }).points).toBe(2);
    // Remis falsch getippt: nur Tendenz (2), keine Tordifferenz
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 2 }).result).toBe("tendency");
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 2 }).points).toBe(2);
    // Halbfinale und Finale doppelt
    expect(scorePrediction({ home: 2, away: 1 }, { home: 2, away: 1 }, "final").points).toBe(8);
    expect(scorePrediction({ home: 1, away: 0 }, { home: 3, away: 1 }, "sf").points).toBe(4);
    expect(scorePrediction({ home: 0, away: 1 }, { home: 2, away: 1 }).points).toBe(0);
  });

  it("summarize zählt offene und bewertete Tipps", () => {
    const m = state.matches[0];
    const done = { ...m, status: "finished" as const, score: { home: 1, away: 0 } };
    const s = summarize(
      {
        [m.id]: { home: 1, away: 0, createdAt: 0 },
        [state.matches[1].id]: { home: 0, away: 0, createdAt: 0 },
      },
      [done, state.matches[1]],
    );
    expect(s).toMatchObject({ rated: 1, open: 1, points: 4, hitRate: 1 });
  });
});
