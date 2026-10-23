import { describe, expect, it } from "vitest";
import { DEMO_DRAW } from "@/demo/demo";
import { FIXTURES, matchId } from "@/tournament/schedule";
import {
  applyLiveFixtures,
  fromEspn,
  fromOpenLiga,
  matchFixture,
  mergeLiveResults,
  type LiveFixture,
} from "./live";
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
    expect(f).toMatchObject({
      status: "finished",
      score: { home: 5, away: 1 },
      homeName: "Deutschland",
    });
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
    const f: LiveFixture = {
      externalId: "x",
      kickoffUtc: "2028-06-09T19:00:00Z",
      city: "Cardiff",
      status: "scheduled",
    };
    expect(matchFixture(f, FIXTURES, empty)).toBe(1);
  });

  it("unterscheidet die beiden Londoner Stadien", () => {
    // 11.6.: Wembley (Spiel 5). 12.6.: Tottenham (Spiel 8)
    expect(
      matchFixture(
        {
          externalId: "a",
          kickoffUtc: "2028-06-11T12:00:00Z",
          city: "London",
          stadium: "Wembley",
          status: "scheduled",
        },
        FIXTURES,
        empty,
      ),
    ).toBe(5);
    expect(
      matchFixture(
        {
          externalId: "b",
          kickoffUtc: "2028-06-12T15:30:00Z",
          city: "London",
          status: "scheduled",
        },
        FIXTURES,
        empty,
      ),
    ).toBe(8);
  });

  it("nutzt die Paarung, wenn Teams bekannt sind", () => {
    const f: LiveFixture = {
      externalId: "y",
      homeName: "Irland",
      awayName: "Deutschland",
      status: "scheduled",
    };
    expect(matchFixture(f, FIXTURES, teamsOf(DEMO_DRAW))).toBe(9);
  });

  it("übernimmt die offizielle Uhrzeit und dreht vertauschte Paarungen", () => {
    const official = "2028-06-12T19:00:00Z"; // Spiel 9 offiziell um 21 Uhr statt 18 Uhr
    const { results, patches } = applyLiveFixtures(
      [
        {
          externalId: "z",
          homeName: "Deutschland",
          awayName: "Irland",
          kickoffUtc: official,
          city: "Dublin",
          status: "finished",
          score: { home: 2, away: 1 },
        },
      ],
      FIXTURES,
      teamsOf(DEMO_DRAW),
      0,
    );
    expect(patches[matchId(9)].kickoffUtc).toBe(official);
    expect(results[matchId(9)].score).toEqual({ home: 1, away: 2 }); // IRL (E1) ist Heimteam
  });
});

describe("Robustheit der Live-Daten", () => {
  const live = (over: Partial<LiveFixture>): LiveFixture => ({
    externalId: "x",
    kickoffUtc: FIXTURES[0].kickoffUtc,
    city: null,
    stadium: null,
    homeName: null,
    awayName: null,
    status: "live",
    ...over,
  });

  it("Wiedersehen im K.-o.-Spiel landet nicht beim Gruppenspiel", () => {
    const group = FIXTURES.find((f) => f.number === 1)!;
    const ko = FIXTURES.find((f) => f.number === 45)!;
    const teams = new Map([
      [1, { home: "WAL", away: "POR" }],
      [45, { home: "POR", away: "WAL" }],
    ]);
    const f = live({ homeName: "Portugal", awayName: "Wales", kickoffUtc: ko.kickoffUtc });
    expect(matchFixture(f, FIXTURES, teams)).toBe(45);
    const g = live({ homeName: "Wales", awayName: "Portugal", kickoffUtc: group.kickoffUtc });
    expect(matchFixture(g, FIXTURES, teams)).toBe(1);
  });

  it("vergessenes Spielende: nach 4 Stunden gilt das Spiel als beendet", () => {
    const def = FIXTURES[0];
    const later = Date.parse(def.kickoffUtc) + 5 * 3_600_000;
    const f = live({ city: "Cardiff", score: { home: 1, away: 0 }, phase: "extra", minute: 300 });
    const { results } = applyLiveFixtures([f], FIXTURES, new Map(), later);
    expect(results[matchId(def.number)]).toMatchObject({ status: "finished", phase: undefined });
  });

  it("keine Verlängerung in der Gruppenphase", () => {
    const def = FIXTURES[0];
    const now = Date.parse(def.kickoffUtc) + 115 * 60_000;
    const f = live({ city: "Cardiff", score: { home: 0, away: 0 }, phase: "extra" });
    const { results } = applyLiveFixtures([f], FIXTURES, new Map(), now);
    expect(results[matchId(def.number)].phase).toBe("second");
  });
});

describe("Zweitquelle ESPN", () => {
  const event = (over: Record<string, unknown> = {}) => ({
    id: 703945,
    date: "2024-07-14T19:00Z",
    status: { displayClock: "67'", type: { name: "STATUS_SECOND_HALF", state: "in" } },
    competitions: [
      {
        venue: { fullName: "Olympiastadion Berlin", address: { city: "Berlin" } },
        competitors: [
          { homeAway: "home", score: "2", team: { displayName: "Spain" } },
          { homeAway: "away", score: "1", team: { displayName: "England" } },
        ],
      },
    ],
    ...over,
  });
  const now = Date.parse("2024-07-14T20:10:00Z");

  it("live mit Minute und Phase", () => {
    expect(fromEspn(event(), now)).toMatchObject({
      externalId: "espn-703945",
      kickoffUtc: "2024-07-14T19:00:00Z",
      homeName: "Spain",
      awayName: "England",
      status: "live",
      score: { home: 2, away: 1 },
      phase: "second",
      minute: 67,
      city: "Berlin",
    });
  });

  it("Elfmeterschießen getrennt vom Spielstand", () => {
    const f = fromEspn(
      event({
        status: { type: { name: "STATUS_FINAL_PEN", state: "post" } },
        competitions: [
          {
            competitors: [
              { homeAway: "home", score: "1", shootoutScore: 5, team: { displayName: "England" } },
              {
                homeAway: "away",
                score: "1",
                shootoutScore: 3,
                team: { displayName: "Switzerland" },
              },
            ],
          },
        ],
      }),
      now + 3 * 3_600_000,
    );
    expect(f).toMatchObject({ status: "finished", score: { home: 1, away: 1 } });
    expect(f.penalties).toEqual({ home: 5, away: 3 });
  });

  it("verlegte Spiele und Spiele in der Zukunft melden nichts", () => {
    const postponed = event({ status: { type: { name: "STATUS_POSTPONED", state: "post" } } });
    expect(fromEspn(postponed, now).status).toBe("scheduled");
    expect(fromEspn(event(), Date.parse("2024-07-14T18:00:00Z")).status).toBe("scheduled");
  });
});

describe("mergeLiveResults", () => {
  const def = FIXTURES[0];
  const t = Date.parse(def.kickoffUtc);
  const f = (over: Partial<LiveFixture>): LiveFixture => ({
    externalId: "x",
    kickoffUtc: def.kickoffUtc,
    city: "Cardiff",
    status: "live",
    score: { home: 0, away: 0 },
    ...over,
  });
  const apply = (list: LiveFixture[]) =>
    applyLiveFixtures(list, FIXTURES, new Map(), t + 30 * 60_000);
  const id = matchId(def.number);

  it("Zweitquelle ist schneller: live statt geplant, beendet statt live", () => {
    const p = apply([f({ status: "scheduled", score: undefined })]);
    const b = apply([f({ externalId: "espn-1", score: { home: 1, away: 0 } })]);
    expect(mergeLiveResults(p, b).results[id]).toMatchObject({ score: { home: 1, away: 0 } });
    const p2 = apply([f({ score: { home: 1, away: 0 } })]);
    const b2 = apply([
      f({ externalId: "espn-1", status: "finished", score: { home: 2, away: 0 } }),
    ]);
    expect(mergeLiveResults(p2, b2).results[id]).toMatchObject({ status: "finished" });
  });

  it("beide beendet → Hauptquelle; Hauptquelle weiter → Hauptquelle", () => {
    const p = apply([f({ status: "finished", score: { home: 1, away: 1 } })]);
    const b = apply([f({ externalId: "espn-1", status: "finished", score: { home: 2, away: 1 } })]);
    expect(mergeLiveResults(p, b).results[id].score).toEqual({ home: 1, away: 1 });
    const b2 = apply([f({ externalId: "espn-1", score: { home: 0, away: 0 } })]);
    expect(mergeLiveResults(p, b2).results[id].status).toBe("finished");
  });
});

describe("OpenLigaDB: echter Datensatz EM 2024 (Portugal – Frankreich, i. E.)", () => {
  // Gekürzt aus https://api.openligadb.de/getmatchdata/em/2024 (Spiel 69386).
  // Die Elfmeter stehen dort ungeordnet in der Torliste, alle mit Minute 120.
  const shots: [number, number][] = [
    [1, 1],
    [2, 2],
    [0, 1],
    [1, 2],
    [2, 3],
    [2, 4],
    [3, 4],
    [3, 5],
  ];
  const real = {
    matchID: 69386,
    matchDateTimeUTC: "2024-07-05T19:00:00Z",
    matchIsFinished: true,
    team1: { teamName: "Portugal" },
    team2: { teamName: "Frankreich" },
    matchResults: [
      { pointsTeam1: 0, pointsTeam2: 0, resultTypeID: 1, resultTypeKind: "HalfTime" },
      { pointsTeam1: 0, pointsTeam2: 0, resultTypeID: 2, resultTypeKind: "After90Minutes" },
      { pointsTeam1: 0, pointsTeam2: 0, resultTypeID: 4, resultTypeKind: "AfterExtraTime" },
      { pointsTeam1: 3, pointsTeam2: 5, resultTypeID: 5, resultTypeKind: "AfterPenalties" },
    ],
    goals: shots.map(([a, b]) => ({
      scoreTeam1: a,
      scoreTeam2: b,
      matchMinute: 120,
      isPenalty: true,
    })),
    location: { locationCity: "Hamburg", locationStadium: "Volksparkstadion" },
  };
  const kickoff = Date.parse(real.matchDateTimeUTC);

  it("beendet: 0:0, Elfmeterschießen 3:5", () => {
    const f = fromOpenLiga(real, kickoff + 4 * 3_600_000);
    expect(f).toMatchObject({ status: "finished", score: { home: 0, away: 0 } });
    expect(f.penalties).toEqual({ home: 3, away: 5 });
    expect(f).toMatchObject({ city: "Hamburg", stadium: "Volksparkstadion" });
  });

  it("während des Elfmeterschießens: Spielstand bleibt 0:0, Phase Elfmeter", () => {
    const live = { ...real, matchIsFinished: false, matchResults: real.matchResults.slice(0, 2) };
    const f = fromOpenLiga(live, kickoff + 140 * 60_000);
    expect(f).toMatchObject({ status: "live", score: { home: 0, away: 0 }, phase: "penalties" });
  });

  it("ohne Ergebnis-Namen gilt die echte Typ-Nummer 4 als „nach Verlängerung“", () => {
    const noKind = {
      ...real,
      matchResults: real.matchResults.map(({ resultTypeKind: _k, ...r }) => r),
      goals: [],
    };
    const f = fromOpenLiga(noKind, kickoff + 4 * 3_600_000);
    expect(f.score).toEqual({ home: 0, away: 0 });
    expect(f.penalties).toEqual({ home: 3, away: 5 });
  });
});
