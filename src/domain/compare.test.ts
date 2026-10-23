import { describe, expect, it } from "vitest";
import { defaultPageStart, defaultRoundIndex } from "./compare";
import type { Round } from "./rounds";
import type { MatchView } from "./types";

const m = (status: MatchView["status"]) => ({ status }) as MatchView;
const round = (...s: MatchView["status"][]): Round => ({
  key: "r",
  label: "r",
  matches: s.map(m),
});

describe("Tipp-Vergleich", () => {
  it("startet beim Spieltag mit Live-Spiel, sonst beim letzten begonnenen, sonst vorne", () => {
    expect(defaultRoundIndex([round("scheduled"), round("scheduled")])).toBe(0);
    expect(defaultRoundIndex([round("finished"), round("finished"), round("scheduled")])).toBe(1);
    expect(defaultRoundIndex([round("finished", "live"), round("finished")])).toBe(0);
  });

  it("blättert zur Seite mit dem laufenden bzw. zuletzt begonnenen Spiel", () => {
    const list = (...s: MatchView["status"][]) => s.map(m);
    expect(defaultPageStart(list("scheduled", "scheduled", "scheduled", "scheduled"), 3)).toBe(0);
    expect(defaultPageStart(list("finished", "finished", "finished", "live", "scheduled"), 3)).toBe(
      3,
    );
    expect(defaultPageStart(list("finished", "finished", "finished", "finished"), 3)).toBe(3);
    expect(defaultPageStart(list("finished", "finished", "scheduled", "scheduled"), 3)).toBe(0);
  });
});
