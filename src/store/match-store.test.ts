import { describe, expect, it } from "vitest";
import { buildDemo, DEMO_SCENARIOS } from "@/demo/demo";
import { resolveTournament } from "@/domain/resolve";
import { resultSignature, type ResultRecord } from "@/domain/types";
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

describe("mergeResults: OpenLigaDB gibt vor, Korrektur überbrückt nur", () => {
  const withSig = (rec: ResultRecord, api?: ResultRecord) => ({
    ...rec,
    sourceSig: resultSignature(api),
  });

  it("Korrektur gilt, solange die Quelle noch den alten Stand meldet", () => {
    const api = r("live", 1, 0, "api");
    const out = mergeResults({ m01: api }, { m01: withSig(r("live", 2, 0, "admin"), api) });
    expect(out.m01.source).toBe("admin");
    expect(out.m01.score).toEqual({ home: 2, away: 0 });
  });

  it("kommt das Tor bei der Quelle an, gilt sofort wieder die Quelle", () => {
    const before = r("live", 1, 0, "api");
    const out = mergeResults(
      { m01: r("live", 2, 0, "api") },
      { m01: withSig(r("live", 2, 0, "admin"), before) },
    );
    expect(out.m01.source).toBe("api");
  });

  it("auch wenn die Quelle danach etwas anderes meldet, gilt die Quelle", () => {
    const before = r("live", 1, 0, "api");
    const out = mergeResults(
      { m01: r("live", 1, 1, "api") },
      { m01: withSig(r("live", 2, 0, "admin"), before) },
    );
    expect(out.m01.score).toEqual({ home: 1, away: 1 });
  });

  it("Spielende der Quelle löst die Korrektur ab", () => {
    const before = r("live", 1, 0, "api");
    const out = mergeResults(
      { m01: r("finished", 1, 0, "api") },
      { m01: withSig(r("live", 2, 0, "admin"), before) },
    );
    expect(out.m01.source).toBe("api");
    expect(out.m01.status).toBe("finished");
  });

  it("Korrektur, als die Quelle noch gar nichts hatte, gilt bis zum ersten Tor", () => {
    const admin = withSig(r("live", 1, 0, "admin"), undefined);
    expect(mergeResults({}, { m01: admin }).m01.source).toBe("admin");
    // Nur die Uhr springt auf „live 0:0“ – das ist nichts Neues von der Quelle.
    expect(mergeResults({ m01: r("live", 0, 0, "api") }, { m01: admin }).m01.source).toBe("admin");
    expect(mergeResults({ m01: r("live", 1, 0, "api") }, { m01: admin }).m01.source).toBe("api");
  });

  it("ältere Korrektur ohne Quellstand bleibt stehen (wie 2026)", () => {
    const out = mergeResults({ m01: r("live", 2, 0, "api") }, { m01: r("live", 1, 0, "admin") });
    expect(out.m01.source).toBe("admin");
  });

  it("ohne Korrektur gelten die Live-Daten", () => {
    expect(mergeResults({ m01: r("live", 2, 0, "api") }, {}).m01.source).toBe("api");
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

describe("Uhr-Tick: Turnier nur neu, wenn sich etwas ändert", () => {
  it("behält das Objekt ohne Änderung und liefert ein neues bei Statuswechsel", async () => {
    const { useMatchStore } = await import("./match-store");
    const realNow = Date.now;
    try {
      let t = 1_800_000_000_000;
      Date.now = () => t;
      const store = useMatchStore.getState();
      store.setDemo({ enabled: true, scenario: "group", startedAt: t });
      const first = useMatchStore.getState().tournament;
      t += 1_000; // eine Sekunde später: nichts passiert
      useMatchStore.getState().tick();
      expect(useMatchStore.getState().tournament).toBe(first);
      expect(useMatchStore.getState().now).toBe(t);
      t += 4 * 3_600_000; // vier Stunden später: laufende Spiele sind beendet
      useMatchStore.getState().tick();
      const later = useMatchStore.getState().tournament;
      expect(later).not.toBe(first);
      const live = (x: typeof first) => x.matches.filter((m) => m.status === "live").length;
      expect(live(first)).toBeGreaterThan(0);
      expect(live(later)).not.toBe(live(first));
    } finally {
      Date.now = realNow;
    }
  });
});
