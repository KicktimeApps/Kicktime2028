import { describe, expect, it } from "vitest";
import { THIRD_PLACE_MATCHES, THIRD_PLACE_TABLE, BRACKET_LAYOUT } from "./bracket";
import { NATIONS, nationFromName } from "./nations";
import { FIXTURES, GROUPS } from "./schedule";
import { VENUES } from "./venues";
import { localParts } from "@/domain/time";

describe("Spielplan EURO 2028", () => {
  it("hat 51 Spiele mit fortlaufenden Nummern", () => {
    expect(FIXTURES).toHaveLength(51);
    expect(FIXTURES.map((f) => f.number)).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
  });

  it("verteilt die Spiele korrekt auf die Runden", () => {
    const count = (s: string) => FIXTURES.filter((f) => f.stage === s).length;
    expect(count("group")).toBe(36);
    expect(count("r16")).toBe(8);
    expect(count("qf")).toBe(4);
    expect(count("sf")).toBe(2);
    expect(count("final")).toBe(1);
  });

  it("jede Gruppe: 6 Spiele, jedes Team 3×, jede Paarung genau einmal", () => {
    for (const g of GROUPS) {
      const games = FIXTURES.filter((f) => f.group === g);
      expect(games).toHaveLength(6);
      const slots = games.flatMap((f) => [f.home, f.away]);
      for (let i = 1; i <= 4; i++) expect(slots.filter((s) => s === `${g}${i}`)).toHaveLength(3);
      const pairs = new Set(games.map((f) => [f.home, f.away].sort().join("-")));
      expect(pairs.size).toBe(6);
    }
  });

  it("3. Spieltag einer Gruppe findet zeitgleich statt", () => {
    for (const g of GROUPS) {
      const md3 = FIXTURES.filter((f) => f.group === g && f.matchday === 3);
      expect(md3).toHaveLength(2);
      expect(md3[0].kickoffUtc).toBe(md3[1].kickoffUtc);
    }
  });

  it("kein Stadion hat zwei Spiele am selben Tag", () => {
    const seen = new Set<string>();
    for (const f of FIXTURES) {
      const key = `${f.venueId}|${localParts(f.kickoffUtc, "Europe/London").dayKey}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("Anstoßzeiten liegen in den UEFA-Fenstern 15/18/21 Uhr MESZ", () => {
    for (const f of FIXTURES) {
      const p = localParts(f.kickoffUtc, "Europe/Berlin");
      expect([15, 18, 21]).toContain(p.hour);
      expect(p.minute).toBe(0);
    }
  });

  it("Eröffnung 9.6. in Cardiff, Finale 9.7. 18 Uhr in Wembley", () => {
    const opener = FIXTURES[0];
    expect(opener.venueId).toBe("cardiff");
    expect(localParts(opener.kickoffUtc, "Europe/Berlin").dayKey).toBe("2028-06-09");
    const final = FIXTURES[50];
    expect(final.venueId).toBe("wembley");
    expect(final.kickoffConfirmed).toBe(true);
    expect(final.kickoffUtc).toBe("2028-07-09T16:00:00Z");
  });

  it("Wembley ist kein Achtelfinal-Spielort, Halbfinals und Finale in Wembley", () => {
    expect(FIXTURES.filter((f) => f.stage === "r16").some((f) => f.venueId === "wembley")).toBe(
      false,
    );
    expect(
      FIXTURES.filter((f) => f.stage === "sf" || f.stage === "final").every(
        (f) => f.venueId === "wembley",
      ),
    ).toBe(true);
  });

  it("alle Stadien existieren", () => {
    const ids = new Set(VENUES.map((v) => v.id));
    expect(VENUES).toHaveLength(9);
    for (const f of FIXTURES) expect(ids.has(f.venueId)).toBe(true);
  });
});

describe("Drittplatzierten-Tabelle", () => {
  it("deckt alle 15 Kombinationen ab und ist in sich stimmig", () => {
    const keys = Object.keys(THIRD_PLACE_TABLE);
    expect(keys).toHaveLength(15);
    for (const [key, map] of Object.entries(THIRD_PLACE_TABLE)) {
      const used = Object.values(map).sort().join("");
      expect(used).toBe(key);
    }
  });

  it("Dritte treffen nur auf erlaubte Gruppensieger laut Spielplan", () => {
    for (const [num, winner] of Object.entries(THIRD_PLACE_MATCHES)) {
      const f = FIXTURES.find((x) => x.number === Number(num))!;
      expect(f.home).toBe(winner);
      const allowed = f.away.slice(1).split("");
      for (const map of Object.values(THIRD_PLACE_TABLE)) {
        expect(allowed).toContain(map[winner]);
      }
    }
  });

  it("Bracket-Layout enthält jedes K.-o.-Spiel genau einmal", () => {
    const all = [
      ...BRACKET_LAYOUT.left.r16,
      ...BRACKET_LAYOUT.left.qf,
      ...BRACKET_LAYOUT.left.sf,
      ...BRACKET_LAYOUT.right.r16,
      ...BRACKET_LAYOUT.right.qf,
      ...BRACKET_LAYOUT.right.sf,
      BRACKET_LAYOUT.final,
    ].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 15 }, (_, i) => i + 37));
  });

  it("jeder Sieger zieht genau einmal weiter, jeder Gruppenplatz genau einmal", () => {
    const ko = FIXTURES.filter((f) => f.stage !== "group");
    const used = new Map<number, number>();
    for (const f of ko)
      for (const slot of [f.home, f.away]) {
        const w = slot.match(/^W(\d+)$/);
        if (!w) continue;
        expect(Number(w[1])).toBeLessThan(f.number);
        used.set(Number(w[1]), (used.get(Number(w[1])) ?? 0) + 1);
      }
    for (const f of ko) expect(used.get(f.number) ?? 0).toBe(f.stage === "final" ? 0 : 1);
    const places = ko.flatMap((f) => [f.home, f.away]).filter((s) => /^[12][A-F]$/.test(s));
    expect([...places].sort()).toEqual(
      ["1", "2"].flatMap((r) => GROUPS.map((g) => `${r}${g}`)).sort(),
    );
  });
});

describe("Nationen", () => {
  it("54 Teilnehmer, eindeutige Kürzel und Flaggen", () => {
    expect(NATIONS).toHaveLength(54);
    expect(new Set(NATIONS.map((n) => n.code)).size).toBe(54);
    expect(new Set(NATIONS.map((n) => n.flag)).size).toBe(54);
    expect(
      NATIONS.filter((n) => n.host)
        .map((n) => n.code)
        .sort(),
    ).toEqual(["ENG", "IRL", "SCO", "WAL"]);
  });

  it("erkennt deutsche, englische und OpenLigaDB-Schreibweisen", () => {
    expect(nationFromName("Deutschland")).toBe("GER");
    expect(nationFromName("Germany")).toBe("GER");
    expect(nationFromName("DEU")).toBe("GER");
    expect(nationFromName("Türkei")).toBe("TUR");
    expect(nationFromName("Turkiye")).toBe("TUR");
    expect(nationFromName("Republic of Ireland")).toBe("IRL");
    expect(nationFromName("Schottland")).toBe("SCO");
    expect(nationFromName("Österreich")).toBe("AUT");
    expect(nationFromName("SV Großefehn")).toBeNull();
  });
});
