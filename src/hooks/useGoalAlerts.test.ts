import { describe, expect, it } from "vitest";
import { detectGoals, type SeenScore } from "./useGoalAlerts";

const prefs = { favorites: ["GER"], interesting: [], spoilerProtection: false, revealed: {} };
const live = (home: number, away: number, id = "m1", teams = ["GER", "TUR"]) => ({
  id,
  status: "live" as const,
  score: { home, away },
  home: teams[0],
  away: teams[1],
});

describe("detectGoals", () => {
  const before = new Map<string, SeenScore>([["m1", { live: true, home: 0, away: 0 }]]);

  it("meldet ein Tor im laufenden Spiel eines eigenen Teams", () => {
    expect(detectGoals(before, [live(1, 0)], prefs).goals).toEqual([
      { matchId: "m1", side: "home", home: 1, away: 0 },
    ]);
    expect(detectGoals(before, [live(0, 1)], prefs).goals[0].side).toBe("away");
  });

  it("nichts ohne vorherigen Stand, ohne Änderung oder bei Korrektur nach unten", () => {
    expect(detectGoals(new Map(), [live(1, 0)], prefs).goals).toEqual([]);
    expect(detectGoals(before, [live(0, 0)], prefs).goals).toEqual([]);
    const after = new Map<string, SeenScore>([["m1", { live: true, home: 2, away: 0 }]]);
    expect(detectGoals(after, [live(1, 0)], prefs).goals).toEqual([]);
  });

  it("nichts bei fremden Teams, beim Abpfiff oder mit Spoilerschutz", () => {
    expect(detectGoals(before, [live(1, 0, "m1", ["ESP", "ITA"])], prefs).goals).toEqual([]);
    const finished = { ...live(1, 0), status: "finished" as const };
    expect(detectGoals(before, [finished], prefs).goals).toEqual([]);
    const spoiler = { ...prefs, spoilerProtection: true };
    expect(detectGoals(before, [live(1, 0)], spoiler).goals).toEqual([]);
    expect(
      detectGoals(before, [live(1, 0)], { ...spoiler, revealed: { m1: true } }).goals,
    ).toHaveLength(1);
  });
});
