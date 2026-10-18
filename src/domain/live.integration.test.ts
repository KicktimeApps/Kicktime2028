import { describe, expect, it } from "vitest";
import { DEMO_DRAW } from "@/demo/demo";
import { getNation } from "@/tournament/nations";
import { FIXTURES } from "@/tournament/schedule";
import { getVenue } from "@/tournament/venues";
import { applyLiveFixtures, fromOpenLiga, type OpenLigaMatch } from "./live";
import { resolveTournament, winnerOf } from "./resolve";
import type { FixturePatch, ResultRecord } from "./types";

/**
 * Simuliert einen kompletten OpenLigaDB-Feed für die EM 2028 – so, wie er
 * nach der Auslosung aussehen könnte: deutsche Teamnamen, offizielle
 * (abweichende) Anstoßzeiten, gelegentlich vertauschte Heim/Gast-Reihenfolge.
 * Die App kennt dabei KEINE Auslosung (DRAW leer) – alles kommt aus dem Feed.
 */
describe("Live-Pipeline Ende-zu-Ende (OpenLigaDB-Feed ohne lokale Auslosung)", () => {
  const AFTER = Date.parse("2028-07-10T12:00:00Z");
  const OFFICIAL_SHIFT_H = 0; // gleicher Tag, aber andere Uhrzeit für Gruppenspiele
  let id = 1000;

  const olMatch = (
    num: number,
    home: string,
    away: string,
    goals: [number, number] | null,
    flip = false,
    pens?: [number, number],
  ): OpenLigaMatch => {
    const f = FIXTURES.find((x) => x.number === num)!;
    const v = getVenue(f.venueId);
    // Offizielle Zeit: 3 Stunden später als der Platzhalter (bleibt am selben Tag)
    const kickoff = new Date(
      Date.parse(f.kickoffUtc) + (f.stage === "group" ? 3 : OFFICIAL_SHIFT_H) * 3_600_000,
    );
    const [h, a] = flip ? [away, home] : [home, away];
    const [gh, ga] = goals ? (flip ? [goals[1], goals[0]] : goals) : [0, 0];
    const results = goals
      ? [
          { pointsTeam1: gh, pointsTeam2: ga, resultTypeKind: "After90Minutes" },
          ...(pens
            ? [
                {
                  pointsTeam1: flip ? pens[1] : pens[0],
                  pointsTeam2: flip ? pens[0] : pens[1],
                  resultTypeKind: "AfterPenalties",
                },
              ]
            : []),
        ]
      : [];
    return {
      matchID: id++,
      matchDateTimeUTC: kickoff.toISOString(),
      matchIsFinished: !!goals,
      team1: { teamName: getNation(h)!.name },
      team2: { teamName: getNation(a)!.name },
      matchResults: results,
      location: { locationCity: v.city, locationStadium: v.name },
    };
  };

  it("ordnet alle Spiele zu, übernimmt Uhrzeiten und spielt das Turnier korrekt durch", () => {
    let results: Record<string, ResultRecord> = {};
    let patches: Record<string, FixturePatch> = {};
    const state = () =>
      resolveTournament({ fixtures: FIXTURES, draw: {}, results, patches, now: AFTER });

    // 1) Gruppenphase: Heimteam gewinnt immer 2:1, jedes 3. Spiel kommt vertauscht
    const groupFeed = FIXTURES.filter((f) => f.stage === "group").map((f, i) =>
      olMatch(f.number, DEMO_DRAW[f.home]!, DEMO_DRAW[f.away]!, [2, 1], i % 3 === 0),
    );
    const teams = new Map(state().matches.map((m) => [m.number, { home: m.home, away: m.away }]));
    const g = applyLiveFixtures(
      groupFeed.map((m) => fromOpenLiga(m, AFTER)),
      FIXTURES,
      teams,
      AFTER,
    );
    expect(g.unmatched).toHaveLength(0);
    results = { ...results, ...g.results };
    patches = { ...patches, ...g.patches };

    let s = state();
    const groupMatches = s.matches.filter((m) => m.stage === "group");
    expect(groupMatches.every((m) => m.home && m.away && m.status === "finished")).toBe(true);
    expect(groupMatches.every((m) => m.kickoffConfirmed)).toBe(true);
    // Ergebnis passt zur Paarung: Das laut Auslosung erstgenannte Team hat 2:1 gewonnen,
    // egal in welcher Reihenfolge die Quelle die Teams geliefert hat.
    for (const m of groupMatches) {
      const f = FIXTURES.find((x) => x.number === m.number)!;
      expect(winnerOf(m)).toBe(DEMO_DRAW[f.home]);
      expect(m.score!.home + m.score!.away).toBe(3);
    }
    expect(s.groupStageComplete).toBe(true);

    // 2) K.-o.-Runde: Feed nennt die echten Teams, Gast gewinnt im Elfmeterschießen
    for (const stage of ["r16", "qf", "sf", "final"] as const) {
      const ko = s.matches.filter((m) => m.stage === stage);
      expect(ko.every((m) => m.home && m.away)).toBe(true);
      const feed = ko.map((m) =>
        olMatch(m.number, m.home!, m.away!, [1, 1], m.number % 2 === 0, [3, 4]),
      );
      const t = new Map(s.matches.map((m) => [m.number, { home: m.home, away: m.away }]));
      const r = applyLiveFixtures(
        feed.map((m) => fromOpenLiga(m, AFTER)),
        FIXTURES,
        t,
        AFTER,
      );
      expect(r.unmatched).toHaveLength(0);
      results = { ...results, ...r.results };
      patches = { ...patches, ...r.patches };
      s = state();
      for (const m of s.matches.filter((x) => x.stage === stage)) {
        // OpenLigaDB führt Elfmeterergebnisse uneinheitlich (mit/ohne Spieltore) –
        // entscheidend ist, dass der Sieger stimmt.
        expect(m.penalties!.away).toBeGreaterThan(m.penalties!.home);
        expect(winnerOf(m)).toBe(m.away);
      }
    }

    const final = s.matches.find((m) => m.stage === "final")!;
    expect(winnerOf(final)).toBeTruthy();
  });
});
