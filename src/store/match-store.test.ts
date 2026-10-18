import { describe, expect, it } from "vitest";
import { buildDemo, DEMO_SCENARIOS } from "@/demo/demo";
import { resolveTournament } from "@/domain/resolve";
import type { ResultRecord } from "@/domain/types";
import { buildIcs } from "@/lib/calendar";
import { FIXTURES } from "@/tournament/schedule";
import { mergeResults } from "./match-store";

const r = (
  status: ResultRecord["status"],
  home: number,
  away: number,
  source: ResultRecord["source"],
): ResultRecord => ({
  status,
  score: { home, away },
  source,
  updatedAt: 0,
});

describe("mergeResults (Admin-Korrektur vs. Live-Daten, wie KickTime 2026)", () => {
  it("Korrektur sperrt die Live-Daten – auch wenn die Quelle mehr Tore meldet", () => {
    const out = mergeResults({ m01: r("live", 2, 0, "api") }, { m01: r("live", 1, 0, "admin") });
    expect(out.m01.source).toBe("admin");
    expect(out.m01.score).toEqual({ home: 1, away: 0 });
  });
  it("offizielles Spielende beendet das Spiel, der korrigierte Stand bleibt", () => {
    const out = mergeResults(
      { m01: r("finished", 2, 0, "api") },
      { m01: r("live", 1, 0, "admin") },
    );
    expect(out.m01.status).toBe("finished");
    expect(out.m01.score).toEqual({ home: 1, away: 0 });
  });
  it("beendete Korrektur gewinnt auch gegen ein anderes offizielles Ergebnis", () => {
    const out = mergeResults(
      { m01: r("finished", 3, 1, "api") },
      { m01: r("finished", 2, 1, "admin") },
    );
    expect(out.m01.score).toEqual({ home: 2, away: 1 });
  });
  it("ohne Korrektur gelten die Live-Daten", () => {
    const out = mergeResults({ m01: r("live", 2, 0, "api") }, {});
    expect(out.m01.source).toBe("api");
  });
});

describe("Vorschau-Modus", () => {
  it("jedes Szenario erzeugt einen gültigen Turnierzustand", () => {
    for (const sc of DEMO_SCENARIOS) {
      const d = buildDemo(sc.id);
      const s = resolveTournament({ fixtures: FIXTURES, ...d });
      expect(s.matches).toHaveLength(51);
      expect(s.matches.every((m) => (m.home && m.away ? true : m.stage !== "group"))).toBe(true);
    }
  });
  it("„Gruppenphase live“ hat laufende Spiele", () => {
    const d = buildDemo("group");
    const s = resolveTournament({ fixtures: FIXTURES, ...d });
    expect(s.matches.some((m) => m.status === "live" && m.score)).toBe(true);
  });
});

describe("Kalender-Export", () => {
  it("erzeugt gültiges iCalendar mit CRLF und Erinnerung", () => {
    const s = resolveTournament({ fixtures: FIXTURES, draw: {}, results: {}, patches: {}, now: 0 });
    const ics = buildIcs(s.matches.slice(0, 2));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20280609T190000Z");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
