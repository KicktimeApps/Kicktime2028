import { describe, expect, it } from "vitest";
import { buildDemo, DEMO_DRAW } from "@/demo/demo";
import { FIXTURES, matchId } from "@/tournament/schedule";
import { resolveTournament, winnerOf } from "./resolve";
import { computeTeamStatuses, tournamentWinner } from "./status";
import type { ResultRecord } from "./types";

const finished = (home: number, away: number, penalties?: [number, number]): ResultRecord => ({
  status: "finished",
  score: { home, away },
  penalties: penalties ? { home: penalties[0], away: penalties[1] } : undefined,
  source: "admin",
  updatedAt: 0,
});

const BEFORE = Date.parse("2027-01-01T00:00:00Z");

describe("resolveTournament – vor der Auslosung", () => {
  const state = resolveTournament({
    fixtures: FIXTURES,
    draw: {},
    results: {},
    patches: {},
    now: BEFORE,
  });

  it("liefert 51 Spiele ohne Teams, alle geplant", () => {
    expect(state.matches).toHaveLength(51);
    expect(state.matches.every((m) => m.home === null && m.away === null)).toBe(true);
    expect(state.matches.every((m) => m.status === "scheduled")).toBe(true);
  });

  it("erfindet keine Ergebnisse", () => {
    expect(state.matches.some((m) => m.score)).toBe(false);
  });
});

describe("resolveTournament – Auslosung & Gruppenphase", () => {
  it("setzt Teams aus der Auslosung ein", () => {
    const s = resolveTournament({
      fixtures: FIXTURES,
      draw: DEMO_DRAW,
      results: {},
      patches: {},
      now: BEFORE,
    });
    const opener = s.matches.find((m) => m.number === 1)!;
    expect([opener.home, opener.away]).toEqual(["WAL", "POR"]);
  });

  it("Gruppensieger wandern erst nach Gruppenabschluss ins Achtelfinale", () => {
    const results: Record<string, ResultRecord> = {};
    // Gruppe A: A1 gewinnt alles, A2 Zweiter
    const groupA = FIXTURES.filter((f) => f.group === "A");
    for (const f of groupA.slice(0, 5)) {
      results[matchId(f.number)] =
        f.home === "A1" ? finished(2, 0) : f.away === "A1" ? finished(0, 2) : finished(1, 1);
    }
    let s = resolveTournament({
      fixtures: FIXTURES,
      draw: DEMO_DRAW,
      results,
      patches: {},
      now: BEFORE,
    });
    expect(s.matches.find((m) => m.number === 37)!.home).toBeNull();

    const last = groupA[5];
    results[matchId(last.number)] = finished(1, 0);
    s = resolveTournament({
      fixtures: FIXTURES,
      draw: DEMO_DRAW,
      results,
      patches: {},
      now: BEFORE,
    });
    const r16 = s.matches.find((m) => m.number === 37)!;
    expect(r16.home).toBe("WAL");
    expect(s.tables.find((t) => t.group === "A")!.complete).toBe(true);
  });
});

describe("resolveTournament – komplettes Demo-Turnier", () => {
  const demo = buildDemo("done");
  const state = resolveTournament({
    fixtures: FIXTURES,
    draw: demo.draw,
    results: demo.results,
    patches: demo.patches,
    now: demo.now,
  });

  it("alle Spiele beendet und alle Paarungen aufgelöst", () => {
    expect(state.matches.every((m) => m.status === "finished")).toBe(true);
    expect(state.matches.every((m) => m.home && m.away)).toBe(true);
    expect(state.groupStageComplete).toBe(true);
    expect(state.qualifiedThirdGroups).toHaveLength(4);
  });

  it("16 verschiedene Teams im Achtelfinale, inkl. vier Gruppendritter", () => {
    const r16 = state.matches.filter((m) => m.stage === "r16");
    const teams = new Set(r16.flatMap((m) => [m.home!, m.away!]));
    expect(teams.size).toBe(16);
    const thirds = state.tables.map((t) => t.rows[2].code).filter((c) => teams.has(c));
    expect(thirds).toHaveLength(4);
  });

  it("jedes K.-o.-Spiel hat einen Sieger, der Europameister steht fest", () => {
    for (const m of state.matches.filter((x) => x.stage !== "group"))
      expect(winnerOf(m)).not.toBeNull();
    const champ = tournamentWinner(state);
    expect(champ).toBeTruthy();
    const statuses = computeTeamStatuses(state, Object.values(DEMO_DRAW), {
      qualified: [],
      eliminated: [],
    });
    expect([...statuses.values()].filter((s) => s.phase === "champion")).toHaveLength(1);
    expect([...statuses.values()].filter((s) => s.phase === "out")).toHaveLength(23);
  });
});

describe("winnerOf", () => {
  const base = { status: "finished" as const, home: "GER", away: "ESP" };
  it("regulär", () => expect(winnerOf({ ...base, score: { home: 2, away: 1 } })).toBe("GER"));
  it("Elfmeterschießen", () =>
    expect(
      winnerOf({ ...base, score: { home: 1, away: 1 }, penalties: { home: 3, away: 4 } }),
    ).toBe("ESP"));
  it("Unentschieden ohne Elfmeterdaten → offen", () =>
    expect(winnerOf({ ...base, score: { home: 1, away: 1 } })).toBeNull());
});

describe("Status aus der Uhr", () => {
  it("bestätigte Anstoßzeit ohne Daten → live, aber ohne erfundenen Spielstand", () => {
    const f = FIXTURES[0];
    const now = Date.parse(f.kickoffUtc) + 30 * 60_000;
    const s = resolveTournament({
      fixtures: FIXTURES,
      draw: DEMO_DRAW,
      results: {},
      patches: { [matchId(1)]: { kickoffUtc: f.kickoffUtc } },
      now,
    });
    const m = s.matches.find((x) => x.number === 1)!;
    expect(m.status).toBe("live");
    expect(m.hasData).toBe(false);
    expect(m.score).toBeUndefined();
  });

  it("vorläufige Anstoßzeit → nicht live schalten", () => {
    const f = FIXTURES[1];
    const now = Date.parse(f.kickoffUtc) + 30 * 60_000;
    const s = resolveTournament({
      fixtures: FIXTURES,
      draw: DEMO_DRAW,
      results: {},
      patches: {},
      now,
    });
    expect(s.matches.find((x) => x.number === 2)!.status).toBe("scheduled");
  });
});
