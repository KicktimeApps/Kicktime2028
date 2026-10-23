import type { Round } from "./rounds";
import type { MatchView } from "./types";

/**
 * Tipp-Vergleich in der Tipprunde – aufgebaut wie bei Kicktipp: ein Spieltag
 * (gleiche Einteilung wie beim Tippen, siehe rounds.ts), darin immer gleich
 * viele Spiele nebeneinander, mit Pfeilen blättern.
 */

/**
 * Welcher Spieltag zuerst erscheint: der mit einem laufenden Spiel, sonst der
 * letzte mit angepfiffenen Spielen, sonst der erste.
 */
export function defaultRoundIndex(rounds: Round[]): number {
  const live = rounds.findIndex((r) => r.matches.some((m) => m.status === "live"));
  if (live >= 0) return live;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].matches.some((m) => m.status !== "scheduled")) return i;
  }
  return 0;
}

/**
 * Erste Seite (Index des ersten Spiels) beim Öffnen eines Spieltags: die mit
 * dem laufenden Spiel, sonst die mit dem zuletzt angepfiffenen, sonst vorne.
 */
export function defaultPageStart(matches: MatchView[], size: number): number {
  let i = matches.findIndex((m) => m.status === "live");
  if (i < 0) {
    for (let j = matches.length - 1; j >= 0; j--) {
      if (matches[j].status !== "scheduled") {
        i = j;
        break;
      }
    }
  }
  return i < 0 ? 0 : Math.floor(i / size) * size;
}
