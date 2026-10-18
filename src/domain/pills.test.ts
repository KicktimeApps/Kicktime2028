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

  it("zeigt nur anstehende Spiele der laufenden Phase", () => {
    expect(pills.all.length).toBeGreaterThan(0);
    for (const m of pills.all) {
      expect(m.status).toBe("scheduled");
      expect(m.stage).toBe("group");
    }
  });

  it("teilt eigene Spiele vollständig in passt/außerhalb auf", () => {
    const own = pills.all.filter((m) => [m.home, m.away].some((c) => c === "GER" || c === "ESP"));
    expect(pills.fits.length + pills.outside.length).toBe(own.length);
  });

  it("führt Deutschland-Spiele immer unter Top", () => {
    for (const m of pills.all.filter((m) => m.home === "GER" || m.away === "GER")) {
      expect(pills.top).toContain(m);
    }
  });

  it("listet Ergebnisse eigener Teams, neueste zuerst", () => {
    expect(pills.results.length).toBeGreaterThan(0);
    const times = pills.results.map((m) => Date.parse(m.kickoffUtc));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
