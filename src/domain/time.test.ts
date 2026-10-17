import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVAILABILITY,
  fitFor,
  localParts,
  relativeDay,
  watchableMinutes,
  type WeekAvailability,
} from "./time";

const TZ = "Europe/Berlin";
const week = (w: { start: number; end: number; off?: boolean }): WeekAvailability =>
  Array(7).fill(w);

describe("localParts", () => {
  it("rechnet UTC korrekt in MESZ um, Montag = 0", () => {
    // Freitag, 9.6.2028, 19:00 UTC = 21:00 MESZ
    const p = localParts("2028-06-09T19:00:00Z", TZ);
    expect(p).toMatchObject({ hour: 21, minute: 0, weekday: 4, dayKey: "2028-06-09" });
  });
  it("UK-Ortszeit ist eine Stunde früher", () => {
    expect(localParts("2028-06-09T19:00:00Z", "Europe/London").hour).toBe(20);
  });
});

describe("Zeitfenster", () => {
  it("Spiel komplett im Fenster → full", () => {
    expect(fitFor("2028-06-12T16:00:00Z", TZ, week({ start: 17, end: 23.5 }))).toBe("full"); // 18:00
  });

  it("15-Uhr-Spiel an einem Arbeitstag passt nicht ins Feierabend-Fenster", () => {
    expect(fitFor("2028-06-12T13:00:00Z", TZ, week({ start: 17.5, end: 23.5 }))).toBe("none");
  });

  it("nur die zweite Halbzeit schaubar → partial", () => {
    // Anstoß 18:00, Feierabend ab 19:00 → ~50 Minuten
    expect(fitFor("2028-06-12T16:00:00Z", TZ, week({ start: 19, end: 23.5 }))).toBe("partial");
  });

  it("Fenster über Mitternacht gehört zum Vortag", () => {
    // Fr 23:00 – Sa 03:00 frei, sonst nichts. Spiel Sa 00:30 MESZ.
    const w: WeekAvailability = Array(7).fill({ start: 0, end: 0, off: true });
    w[4] = { start: 23, end: 27 };
    const kickoff = "2028-06-09T22:30:00Z"; // Sa 00:30 MESZ
    expect(localParts(kickoff, TZ).weekday).toBe(5);
    expect(watchableMinutes(kickoff, TZ, w)).toBeGreaterThanOrEqual(100);
    expect(fitFor(kickoff, TZ, w)).toBe("full");
  });

  it("freie Tage werden respektiert", () => {
    const w = [...DEFAULT_AVAILABILITY];
    w[4] = { start: 17, end: 24, off: true };
    expect(fitFor("2028-06-09T19:00:00Z", TZ, w)).toBe("none"); // Fr 21:00
  });

  it("andere Zeitzone verschiebt die Bewertung", () => {
    // 21:00 MESZ = 15:00 in New York → im Feierabend-Fenster dort nicht
    expect(
      fitFor("2028-06-12T19:00:00Z", "America/New_York", week({ start: 17.5, end: 23.5 })),
    ).toBe("none");
  });
});

describe("relativeDay", () => {
  it("Heute/Morgen/Gestern", () => {
    const now = Date.parse("2028-06-10T10:00:00Z");
    expect(relativeDay("2028-06-10T19:00:00Z", now, TZ)).toBe("Heute");
    expect(relativeDay("2028-06-11T19:00:00Z", now, TZ)).toBe("Morgen");
    expect(relativeDay("2028-06-09T19:00:00Z", now, TZ)).toBe("Gestern");
    expect(relativeDay("2028-06-14T19:00:00Z", now, TZ)).toBeNull();
  });
});
