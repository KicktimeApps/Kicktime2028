import { localParts } from "./time";
import type { MatchView } from "./types";

/**
 * Tipp-Vergleich in der Tipprunde: Spiele nach Spieltag (Kalendertag in der
 * Zeitzone des Nutzers) gruppieren und den Tag wählen, der gerade zählt.
 */
export type MatchDay = { key: string; matches: MatchView[] };

export function matchDays(matches: MatchView[], timeZone: string): MatchDay[] {
  const byDay = new Map<string, MatchView[]>();
  const sorted = [...matches].sort(
    (a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.number - b.number,
  );
  for (const m of sorted) {
    const key = localParts(m.kickoffUtc, timeZone).dayKey;
    const list = byDay.get(key);
    if (list) list.push(m);
    else byDay.set(key, [m]);
  }
  return [...byDay].map(([key, list]) => ({ key, matches: list }));
}

/**
 * Welcher Tag zuerst erscheint: der mit einem laufenden Spiel, sonst der
 * letzte Tag mit angepfiffenen Spielen, sonst der erste Tag des Turniers.
 */
export function defaultDayIndex(days: MatchDay[]): number {
  const live = days.findIndex((d) => d.matches.some((m) => m.status === "live"));
  if (live >= 0) return live;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].matches.some((m) => m.status !== "scheduled")) return i;
  }
  return 0;
}
