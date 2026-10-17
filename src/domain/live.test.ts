import { describe, expect, it } from "vitest";
import { DEMO_DRAW } from "@/demo/demo";
import { FIXTURES, matchId } from "@/tournament/schedule";
import { applyLiveFixtures, fromOpenLiga, matchFixture, type LiveFixture } from "./live";
import { resolveTournament } from "./resolve";

const teamsOf = (draw: Record<string, string>) => {
  const s = resolveTournament({ fixtures: FIXTURES, draw, results: {}, patches: {}, now: 0 });
  return new Map(s.matches.map((m) => [m.number, { home: m.home, away: m.away }]));
};

describe("fromOpenLiga", () => {
  it("beendetes Spiel mit Halbzeit- und Endergebnis", () => {
    const f = fromOpenLiga(
      {
        matchID: 1,
        matchDateTimeUTC: "2024-06-14T19:00:00Z",
        matchIsFinished: true,
        team1: { teamName: "Deutschland" },
        team2: { teamName: "Schottland" },
        matchResults: [
          { pointsTeam1: 3, pointsTeam2: 0, resultTypeID: 1, resultTypeKind: "HalfTime" },
          { pointsTeam1: 5, pointsTeam2: 1, resultTypeID: 2, resultTypeKind: "After90Minutes" },
        ],
        location: { locationCity: "München" },
      },
      Date.parse("2024-06-15T00:00:00Z"),
    );
    expect(f).toMatchObject({ status: "finished", score: { home: 5, away: 1 }, homeName: "Deutschland" });
    expect(f.penalties).toBeUndefined();
  });

  it("Elfmeterschießen wird separat erkannt", () => {
    const f = fromOpenLiga(
      {
        matchID: 2,
        matchDateTimeUTC: "2024-07-05T16:00:00Z",
        matchIsFinished: true,
        team1: { teamName: "Spanien" },
        team2: { teamName: "Deutschland" },
        matchResults: [
          { pointsTeam1: 1, pointsTeam2: 1, resultTypeKind: "After90Minutes" },
          { pointsTeam1: 1, pointsTeam2: 1, resultTypeKind: "AfterExtraTime" },
          { pointsTeam1: 5, pointsTeam2: 4, resultTypeKind: "AfterPenalties" },
        ],
      },
      Date.parse("2024-07-06T00:00:00Z"),
    );
    expect(f.score).toEqual({ home: 1, away: 1 });
    expect(f.penalties).toEqual({ home: 4, away: 3 });
  });

  it("laufendes Spiel nutzt die Torliste als Zwischenstand", () => {
    const kickoff = Date.parse("2028-06-10T16:00:00Z");
    const f = fromOpenLiga(
      {
        matchID: 3,
        matchDateTimeUTC: "2028-06-10T16:00:00Z",
        matchIsFinished: false,
        team1: { teamName: "England" },
        team2: { teamName: "Niederlande" },
        goals: [{ scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12 }],
      },
      kickoff + 70 * 60_000,
    );
    expect(f).toMatchObject({ status: "live", score: { home: 1, away: 0 }, phase: "second" });
  });

  it("Spiele in der Zukunft sind nie live oder beendet", () => {
    const f = fromOpenLiga(
      { matchID: 4, matchDateTimeUTC: "2028-06-10T16:00:00Z", matchIsFinished: true },
      Date.parse("2028-06-01T00:00:00Z"),
    );
    expect(f.status).toBe("scheduled");
  });
});

describe("matchFixture", () => {
  const empty = teamsOf({});

  it("ordnet über Tag + Stadt zu, auch ohne bekannte Teams", () => {
    const f: LiveFixture = { externalId: "x", kickoffUtc: "2028-06-09T19:00:00Z", city: "Cardiff", status: "scheduled" };
    expect(matchFixture(f, FIXTURES, empty)).toBe(1);
  });

  it("unterscheidet die beiden Londoner Stadien", () => {
    // 11.6.: Wembley (Spiel 5). 12.6.: Tottenham (Spiel 8)
    expect(matchFixture({ externalId: "a", kickoffUtc: "2028-06-11T12:00:00Z", city: "London", stadium: "Wembley", status: "scheduled" }, FIXTURES, empty)).toBe(5);
    expect(matchFixture({ externalId: "b", kickoffUtc: "2028-06-12T15:30:00Z", city: "London", status: "scheduled" }, FIXTURES, empty)).toBe(8);
  });

  it("nutzt die Paarung, wenn Teams bekannt sind", () => {
    const f: LiveFixture = { externalId: "y", homeName: "Irland", awayName: "Deutschland", status: "scheduled" };
    expect(matchFixture(f, FIXTURES, teamsOf(DEMO_DRAW))).toBe(9);
  });

  it("übernimmt die offizielle Uhrzeit und dreht vertauschte Paarungen", () => {
    const official = "2028-06-12T19:00:00Z"; // Spiel 9 offiziell um 21 Uhr statt 18 Uhr
    const { results, patches } = applyLiveFixtures(
      [{ externalId: "z", homeName: "Deutschland", awayName: "Irland", kickoffUtc: official, city: "Dublin", status: "finished", score: { home: 2, away: 1 } }],
      FIXTURES,
      teamsOf(DEMO_DRAW),
      0,
    );
    expect(patches[matchId(9)].kickoffUtc).toBe(official);
    expect(results[matchId(9)].score).toEqual({ home: 1, away: 2 }); // IRL (E1) ist Heimteam
  });
});
