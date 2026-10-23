import { recommend, type Prefs } from "./recommend";
import type { MatchView } from "./types";

export type PillId = "perfect" | "outside" | "results";

export type Pills = Record<PillId, MatchView[]>;

/**
 * Die drei Pillen der Startseite (wie „Perfect / Nacht / Verpasst“ bei
 * KickTime 2026), jeweils nur Spiele deiner Teams:
 *
 * - **perfect**: anstehend und komplett oder teilweise in deiner Zeit
 * - **outside**: anstehend, aber außerhalb deiner Zeit
 * - **results**: beendet, neueste zuerst
 *
 * Laufende Spiele stehen darüber unter „Jetzt live“.
 */
export function buildPills(matches: MatchView[], prefs: Prefs): Pills {
  const pills: Pills = { perfect: [], outside: [], results: [] };
  for (const m of matches) {
    const r = recommend(m, prefs);
    if (!r.mine) continue;
    if (m.status === "finished") pills.results.push(m);
    else if (m.status === "scheduled") (r.fit === "none" ? pills.outside : pills.perfect).push(m);
  }
  pills.results.reverse();
  return pills;
}
