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
  const join = mode === "join";
  return {
    id: `demo-${c}`,
    code: c,
    name: join ? `Runde ${c}` : name,
    isOwner: !join,
    myName,
    // Beigetreten: Die anderen sind schon drin, man selbst wartet auf Freigabe.
    // Erstellt: Zwei ausgedachte Freunde fragen an – zum Ausprobieren.
    members: join ? PEOPLE.map((p) => p.id) : [],
    requests: join ? [] : ["demo-lena", "demo-tom"],
    pending: join,
  };
}

export function demoMemberCount(g: DemoGroup): number {
  return 1 + g.members.length;
}

/** Name eines ausgedachten Mitspielers. */
export function demoName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? "Jemand";
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
  const others: TipMember[] = PEOPLE.filter((p) => g.members.includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    // Beigetreten: Die Runde gehört Oma Gerda.
    isOwner: !g.isOwner && p.id === "demo-oma",
    isMe: false,
    champion: playable.length > 0 ? p.champion : null,
    tips: Object.fromEntries(playable.map((m) => [m.id, tipFor(p, m)])),
  }));
  return {
    group: { id: g.id, code: g.code, name: g.name, isOwner: g.isOwner },
    requests: g.isOwner ? g.requests.map((id) => ({ id, name: demoName(id) })) : [],
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
