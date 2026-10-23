import { describe, expect, it } from "vitest";
import { buildBoard, CHAMPION_BONUS } from "./predictions";
import type { MatchView } from "./types";

const match = (id: string, home: number, away: number, stage: MatchView["stage"] = "group") =>
  ({ id, stage, status: "finished", score: { home, away } }) as MatchView;

describe("Tipprunde: Tabelle", () => {
  const matches = [match("m01", 2, 1), match("m02", 0, 0), match("m51", 1, 0, "final")];

  it("zählt Punkte, Volltreffer und Treffer; Finale doppelt", () => {
    const [anna] = buildBoard(
      [{ id: "a", name: "Anna", tips: { m01: { home: 2, away: 1 }, m51: { home: 2, away: 0 } } }],
      matches,
    );
    // m01 exakt 4, m51 Tendenz 2×2=4
    expect(anna).toMatchObject({ points: 8, exact: 1, hits: 2, rated: 2, rank: 1 });
  });

  it("Gleichstand: mehr Volltreffer gewinnt, sonst geteilter Platz", () => {
    const rows = buildBoard(
      [
        { id: "a", name: "Anna", tips: { m01: { home: 3, away: 2 }, m02: { home: 1, away: 1 } } }, // 3 + 2
        { id: "b", name: "Bert", tips: { m01: { home: 1, away: 0 }, m02: { home: 0, away: 0 } } }, // 3 + 4
        { id: "c", name: "Cleo", tips: { m01: { home: 3, away: 2 }, m02: { home: 2, away: 2 } } }, // 3 + 2
      ],
      matches,
    );
    expect(rows.map((r) => [r.name, r.points, r.rank])).toEqual([
      ["Bert", 7, 1],
      ["Anna", 5, 2],
      ["Cleo", 5, 2],
    ]);
  });

  it("Spoilerschutz: nur freigegebene Spiele zählen", () => {
    const [row] = buildBoard(
      [{ id: "a", name: "Anna", tips: { m01: { home: 2, away: 1 }, m02: { home: 0, away: 0 } } }],
      matches,
      { counts: (m) => m.id === "m01" },
    );
    expect(row.points).toBe(4);
  });

  it("Europameister-Bonus", () => {
    const [row] = buildBoard([{ id: "a", name: "Anna", tips: {}, champion: "GER" }], matches, {
      champion: "GER",
    });
    expect(row.points).toBe(CHAMPION_BONUS);
  });

  describe("vorläufige Punkte (laufende Spiele)", () => {
    const live = { ...match("m03", 1, 0), status: "live" } as MatchView;
    const tips = { m01: { home: 2, away: 1 }, m03: { home: 1, away: 0 } };

    it("zählen ohne `live` nicht mit", () => {
      const [row] = buildBoard([{ id: "a", name: "Anna", tips }], [...matches, live]);
      expect(row.points).toBe(4);
      expect(row.hasLive).toBe(false);
      expect(row.livePoints).toBe(0);
    });

    it("zählen mit `live` vorläufig mit und bestimmen die Reihenfolge", () => {
      const rows = buildBoard(
        [
          { id: "a", name: "Anna", tips: { m01: { home: 2, away: 1 }, m03: { home: 0, away: 2 } } },
          { id: "b", name: "Bert", tips: { m01: { home: 1, away: 0 }, m03: { home: 1, away: 0 } } },
        ],
        [...matches, live],
        { live: true },
      );
      expect(rows.map((r) => [r.name, r.points, r.livePoints, r.hasLive])).toEqual([
        ["Bert", 3 + 4, 4, true],
        ["Anna", 4, 0, true],
      ]);
    });

    it("Spiele ohne Zwischenstand und verdeckte Spiele zählen nicht", () => {
      const noScore = { ...live, id: "m04", score: undefined } as MatchView;
      const [row] = buildBoard(
        [{ id: "a", name: "Anna", tips: { ...tips, m04: { home: 0, away: 0 } } }],
        [...matches, live, noScore],
        { live: true, counts: (m) => m.id !== "m03" },
      );
      expect(row.points).toBe(4);
      expect(row.hasLive).toBe(false);
    });
  });
});
