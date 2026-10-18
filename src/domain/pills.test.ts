import { describe, expect, it } from "vitest";
import { buildDemo } from "@/demo/demo";
import { FIXTURES } from "@/tournament/schedule";
import { buildPills } from "./pills";
import { resolveTournament } from "./resolve";
import { DEFAULT_AVAILABILITY } from "./time";

const prefs = {
  favorites: ["GER"],
  interesting: ["ESP"],
  pinned: [],
  availability: DEFAULT_AVAILABILITY,
  timeZone: "Europe/Berlin",
};

describe("buildPills", () => {
  const { matches } = resolveTournament({ fixtures: FIXTURES, ...buildDemo("group") });
  const pills = buildPills(matches, prefs);
  const own = (m: { home: string | null; away: string | null }) =>
    [m.home, m.away].some((c) => c === "GER" || c === "ESP");

  it("„Alle“ zeigt nur anstehende Spiele der laufenden Phase", () => {
    expect(pills.all.length).toBeGreaterThan(0);
    for (const m of pills.all) {
      expect(m.status).toBe("scheduled");
      expect(m.stage).toBe("group");
    }
  });

  it("„Meine Spiele“ enthält alle anstehenden eigenen Spiele", () => {
    const expected = matches.filter((m) => m.status === "scheduled" && own(m));
    expect(pills.mine).toEqual(expected);
  });

  it("lässt das Spiel aus der großen Box weg", () => {
    const first = pills.mine[0];
    expect(buildPills(matches, prefs, { exclude: first.id }).mine).not.toContain(first);
  });

  it("listet Ergebnisse eigener Teams, neueste zuerst", () => {
    expect(pills.results.length).toBeGreaterThan(0);
    const times = pills.results.map((m) => Date.parse(m.kickoffUtc));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
