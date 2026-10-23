import { describe, expect, it } from "vitest";
import { resultKeys, tablesHidden } from "./table-spoiler";
import type { MatchView } from "./types";

const m = (id: string, status: MatchView["status"], home?: number, away?: number) =>
  ({ id, status, score: home === undefined ? undefined : { home, away } }) as MatchView;

describe("Spoilerschutz der Tabellen", () => {
  const before = [m("m01", "finished", 2, 1), m("m02", "live", 0, 0), m("m03", "scheduled")];

  it("verdeckt, solange Ergebnisse ungesehen sind", () => {
    expect(tablesHidden(before, [], {})).toBe(true);
  });

  it("bleibt nach „Anzeigen“ offen – auch nach Seitenwechsel (gespeicherter Stand)", () => {
    expect(tablesHidden(before, resultKeys(before), {})).toBe(false);
  });

  it("verdeckt wieder, wenn danach ein Tor fällt oder ein Spiel endet", () => {
    const seen = resultKeys(before);
    expect(tablesHidden([before[0], m("m02", "live", 1, 0), before[2]], seen, {})).toBe(true);
    expect(tablesHidden([before[0], m("m02", "finished", 0, 0), before[2]], seen, {})).toBe(true);
  });

  it("einzeln aufgedeckte Spiele zählen als gesehen", () => {
    expect(tablesHidden(before, [], { m01: true, m02: true })).toBe(false);
  });

  it("ohne gespielte Spiele nichts zu verdecken", () => {
    expect(tablesHidden([m("m03", "scheduled")], [], {})).toBe(false);
  });
});
