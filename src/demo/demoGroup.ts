import type { MatchView } from "@/domain/types";
import type { TipBoard, TipMember } from "@/services/tipgroups";

/**
 * Beispiel-Tipprunde für den Vorschau-Modus: ausgedachte Mitspieler mit
 * festen Tipps (aus Spiel und Person abgeleitet, also bei jedem Öffnen
 * gleich). Läuft komplett auf dem Gerät – nichts geht an den Server.
 */
export const DEMO_GROUP = { id: "demo", code: "VORSCH", name: "Familienrunde (Vorschau)" };

const PEOPLE: { id: string; name: string; boldness: number; champion: string }[] = [
  { id: "demo-oma", name: "Oma Gerda", boldness: 0.2, champion: "GER" },
  { id: "demo-klaus", name: "Onkel Klaus", boldness: 0.9, champion: "ENG" },
  { id: "demo-lena", name: "Lena", boldness: 0.5, champion: "ESP" },
  { id: "demo-tom", name: "Tom", boldness: 0.7, champion: "FRA" },
];

/** Kleiner, deterministischer Zufall (0 … 1) aus einem Text. */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function tipFor(person: (typeof PEOPLE)[number], m: MatchView) {
  const r1 = rand(`${person.id}:${m.id}:h`);
  const r2 = rand(`${person.id}:${m.id}:a`);
  // Mutige tippen mehr Tore, Vorsichtige eher 1:0 / 1:1.
  const max = 1 + Math.round(person.boldness * 3);
  return { home: Math.floor(r1 * (max + 1)), away: Math.floor(r2 * max) };
}

/**
 * Tabelle der Beispielrunde. Fremde Tipps wie in echt nur für Spiele, die
 * (in der Vorschau) schon angepfiffen sind; eigene Tipps kommen vom Gerät.
 */
export function demoBoard(matches: MatchView[], kicked: string[], myName: string): TipBoard {
  const playable = matches.filter((m) => m.home && m.away && m.status !== "scheduled");
  const others: TipMember[] = PEOPLE.filter((p) => !kicked.includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    isOwner: false,
    isMe: false,
    champion: playable.length > 0 ? p.champion : null,
    tips: Object.fromEntries(playable.map((m) => [m.id, tipFor(p, m)])),
  }));
  return {
    group: { ...DEMO_GROUP, isOwner: true },
    members: [
      { id: "demo-me", name: myName || "Du", isOwner: true, isMe: true, champion: null, tips: {} },
      ...others,
    ],
  };
}
