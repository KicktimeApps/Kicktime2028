import { describe, expect, it } from "vitest";
import { defaultDayIndex, matchDays } from "./compare";
import type { MatchView } from "./types";

const m = (number: number, kickoffUtc: string, status: MatchView["status"] = "scheduled") =>
  ({ id: `m${number}`, number, kickoffUtc, status }) as MatchView;

describe("Tipp-Vergleich: Spieltage", () => {
  const matches = [
    m(3, "2028-06-10T19:00:00Z"),
    m(1, "2028-06-09T19:00:00Z"),
    m(2, "2028-06-10T13:00:00Z"),
    // 22:30 UTC ist in Berlin schon der nächste Tag
    m(4, "2028-06-10T22:30:00Z"),
  ];

  it("gruppiert nach Kalendertag in der Zeitzone, sortiert nach Anstoß", () => {
    const days = matchDays(matches, "Europe/Berlin");
    expect(days.map((d) => [d.key, d.matches.map((x) => x.number)])).toEqual([
      ["2028-06-09", [1]],
      ["2028-06-10", [2, 3]],
      ["2028-06-11", [4]],
    ]);
    expect(matchDays(matches, "UTC").map((d) => d.matches.length)).toEqual([1, 3]);
  });

  it("zeigt zuerst den Tag mit Live-Spiel, sonst den letzten begonnenen, sonst den ersten", () => {
    const days = (s: MatchView["status"][]) =>
      matchDays(
        matches.map((x, i) => ({ ...x, status: s[i] })),
        "Europe/Berlin",
      );
    expect(defaultDayIndex(days(["scheduled", "scheduled", "scheduled", "scheduled"]))).toBe(0);
    expect(defaultDayIndex(days(["finished", "finished", "finished", "scheduled"]))).toBe(1);
    expect(defaultDayIndex(days(["live", "finished", "finished", "finished"]))).toBe(1);
  });
});
