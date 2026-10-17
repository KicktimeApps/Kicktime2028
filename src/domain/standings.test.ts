import { describe, expect, it } from "vitest";
import { getVenue } from "@/tournament/venues";
import { groupTable, rankThirds } from "./standings";
import type { MatchView } from "./types";

let n = 0;
function game(home: string, away: string, h: number, a: number): MatchView {
  n++;
  return {
    id: `t${n}`,
    number: n,
    stage: "group",
    group: "A",
    slotHome: "A1",
    slotAway: "A2",
    home,
    away,
    venue: getVenue("wembley"),
    kickoffUtc: "2028-06-10T16:00:00Z",
    kickoffConfirmed: true,
    status: "finished",
    score: { home: h, away: a },
    hasData: true,
  };
}

describe("groupTable", () => {
  it("zählt Punkte, Tore und Form", () => {
    const t = groupTable("A", [
      game("GER", "SCO", 5, 1),
      game("HUN", "SUI", 1, 3),
      game("GER", "HUN", 2, 0),
      game("SCO", "SUI", 1, 1),
      game("SUI", "GER", 1, 1),
      game("SCO", "HUN", 0, 1),
    ]);
    expect(t.rows.map((r) => r.code)).toEqual(["GER", "SUI", "HUN", "SCO"]);
    expect(t.rows[0]).toMatchObject({
      points: 7,
      goalsFor: 8,
      goalsAgainst: 2,
      goalDiff: 6,
      form: ["W", "W", "D"],
    });
    expect(t.complete).toBe(true);
  });

  it("direkter Vergleich schlägt Tordifferenz (UEFA)", () => {
    // AAA und BBB je 6 Punkte; BBB hat bessere Tordifferenz, AAA gewann aber den direkten Vergleich.
    const t = groupTable("A", [
      game("AUT", "BEL", 1, 0),
      game("BEL", "CRO", 5, 0),
      game("BEL", "DEN", 5, 0),
      game("AUT", "CRO", 0, 1),
      game("AUT", "DEN", 1, 0),
      game("CRO", "DEN", 0, 0),
    ]);
    expect(t.rows[0].code).toBe("AUT");
    expect(t.rows[1].code).toBe("BEL");
    expect(t.rows[0].goalDiff).toBeLessThan(t.rows[1].goalDiff);
  });

  it("Dreier-Gleichstand: Kriterien erneut für verbleibende Teams anwenden", () => {
    // AUT, BEL, CRO je 6 Punkte (Ringschluss), DEN 0.
    const t = groupTable("A", [
      game("AUT", "BEL", 2, 0),
      game("BEL", "CRO", 1, 0),
      game("CRO", "AUT", 1, 0),
      game("AUT", "DEN", 1, 0),
      game("BEL", "DEN", 3, 0),
      game("CRO", "DEN", 2, 0),
    ]);
    // H2H-Mini-Tabelle: AUT +1 (2:1), BEL -1 (1:2), CRO 0 (1:1)
    expect(t.rows.map((r) => r.code)).toEqual(["AUT", "CRO", "BEL", "DEN"]);
  });

  it("Live-Zwischenstände nur auf Wunsch", () => {
    const live = { ...game("GER", "SCO", 1, 0), status: "live" as const };
    expect(groupTable("A", [live]).rows.every((r) => r.points === 0)).toBe(true);
    expect(groupTable("A", [live], { includeLive: true }).rows[0]).toMatchObject({
      code: "GER",
      points: 3,
    });
  });
});

describe("rankThirds", () => {
  it("sortiert nach Punkten, Tordifferenz, Toren, Siegen", () => {
    const mk = (group: "A" | "B", pts: number, gd: number, gf: number, won: number) => ({
      group,
      complete: true,
      drawn: true,
      rows: [0, 1, 2, 3].map((i) => ({
        code: `${group}${i}`,
        played: 3,
        won: i === 2 ? won : 0,
        drawn: 0,
        lost: 0,
        goalsFor: i === 2 ? gf : 0,
        goalsAgainst: 0,
        goalDiff: i === 2 ? gd : 0,
        points: i === 2 ? pts : 0,
        form: [],
      })),
    });
    const r = rankThirds([mk("A", 4, 0, 3, 1), mk("B", 4, 1, 2, 1)], 1);
    expect(r[0].group).toBe("B");
    expect(r[0].qualified).toBe(true);
    expect(r[1].qualified).toBe(false);
  });
});
