import type { MatchView } from "@/domain/types";
import type { TipBoard, TipMember } from "@/services/tipgroups";
import type { DemoGroup } from "@/store/app-store";

/**
 * Tipprunden im Vorschau-Modus: Erstellen und Beitreten wie in echt, aber
 * nur auf dem Gerät. Wer mit Code beitritt, trifft ausgedachte Mitspieler
 * mit festen Tipps (aus Spiel und Person abgeleitet, also bei jedem Öffnen
 * gleich). Nichts geht an den Server.
 */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newDemoGroup(
  mode: "create" | "join",
  name: string,
  myName: string,
  code?: string,
): DemoGroup {
  const c =
    code ??
    Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
      "",
    );
  return {
    id: `demo-${c}`,
    code: c,
    name: mode === "create" ? name : `Runde ${c}`,
    isOwner: mode === "create",
    myName,
    withFriends: mode === "join",
    kicked: [],
  };
}

export function demoMemberCount(g: DemoGroup): number {
  return 1 + (g.withFriends ? PEOPLE.filter((p) => !g.kicked.includes(p.id)).length : 0);
}

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
 * Tabelle einer Vorschau-Runde. Fremde Tipps wie in echt nur für Spiele,
 * die (in der Vorschau) schon angepfiffen sind; eigene Tipps kommen vom Gerät.
 */
export function demoBoard(matches: MatchView[], g: DemoGroup): TipBoard {
  const playable = matches.filter((m) => m.home && m.away && m.status !== "scheduled");
  const others: TipMember[] = (g.withFriends ? PEOPLE : [])
    .filter((p) => !g.kicked.includes(p.id))
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      // Beigetreten: Die Runde gehört jemand anderem.
      isOwner: !g.isOwner && i === 0,
      isMe: false,
      champion: playable.length > 0 ? p.champion : null,
      tips: Object.fromEntries(playable.map((m) => [m.id, tipFor(p, m)])),
    }));
  return {
    group: { id: g.id, code: g.code, name: g.name, isOwner: g.isOwner },
    members: [
      {
        id: "demo-me",
        name: g.myName || "Du",
        isOwner: g.isOwner,
        isMe: true,
        champion: null,
        tips: {},
      },
      ...others,
    ],
  };
}
