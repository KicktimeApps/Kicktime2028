import { describe, expect, it } from "vitest";
import { buildDemo } from "@/demo/demo";
import { FIXTURES } from "@/tournament/schedule";
import { buildPills } from "./pills";
import { resolveTournament } from "./resolve";
import { DEFAULT_AVAILABILITY, fitFor } from "./time";

const prefs = {
  favorites: ["GER"],
  interesting: ["ESP"],
  pinned: [],
  availability: DEFAULT_AVAILABILITY,
  timeZone: "Europe/Berlin",
};

describe("buildPills", () => {
  const { matches } = resolveTournament({ fixtures: FIXTURES, ...buildDemo("drawn") });
  const pills = buildPills(matches, prefs);
  const own = (m: { home: string | null; away: string | null }) =>
    [m.home, m.away].some((c) => c === "GER" || c === "ESP");

  it("teilt alle anstehenden eigenen Spiele in perfekt/außerhalb auf", () => {
    const expected = matches.filter((m) => m.status === "scheduled" && own(m));
    expect(pills.perfect.length + pills.outside.length).toBe(expected.length);
    expect(pills.perfect.length).toBeGreaterThan(0);
  });

  it("„Perfekt“ nur mit Spielen in deiner Zeit, „Außerhalb“ nur außerhalb", () => {
    for (const m of pills.perfect)
      expect(fitFor(m.kickoffUtc, prefs.timeZone, prefs.availability)).not.toBe("none");
    for (const m of pills.outside)
      expect(fitFor(m.kickoffUtc, prefs.timeZone, prefs.availability)).toBe("none");
  });

  it("Ergebnisse: nur beendete eigene Spiele, neueste zuerst", () => {
    const { matches: later } = resolveTournament({ fixtures: FIXTURES, ...buildDemo("group") });
    const results = buildPills(later, prefs).results;
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((m) => m.status === "finished" && own(m))).toBe(true);
    const times = results.map((m) => Date.parse(m.kickoffUtc));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
