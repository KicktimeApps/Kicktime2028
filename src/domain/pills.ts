import { recommend, type Prefs } from "./recommend";
import { currentStage } from "./status";
import type { MatchView } from "./types";

export type PillId = "fits" | "outside" | "top" | "all" | "results";

export type Pills = Record<PillId, MatchView[]>;

/** Deutschland-Spiele zählen immer als Highlight – die App richtet sich an deutsche Fans. */
const HOME_NATION = "GER";

/**
 * Teilt die Spiele für die Pillen der Startseite auf (wie bei KickTime 2026):
 *
 * - **fits**: Spiele deiner Teams, die in deine Zeit passen
 * - **outside**: Spiele deiner Teams außerhalb deiner Zeit
 * - **top**: Eröffnungsspiel, Deutschland, Top-Duelle, ab Viertelfinale alles
 * - **all**: alle anstehenden Spiele der laufenden Turnierphase
 * - **results**: beendete Spiele deiner Teams, neueste zuerst
 *
 * Laufende Spiele stehen darüber unter „Jetzt live“ und fehlen hier bewusst.
 * Bis auf die Ergebnisse gilt alles nur für die aktuelle Turnierphase, damit
 * die Listen kurz bleiben.
 */
export function buildPills(matches: MatchView[], prefs: Prefs): Pills {
  const stage = currentStage(matches);
  const pills: Pills = { fits: [], outside: [], top: [], all: [], results: [] };
  for (const m of matches) {
    const r = recommend(m, prefs);
    if (m.status === "finished") {
      if (r.mine) pills.results.push(m);
      continue;
    }
    if (m.status !== "scheduled" || m.stage !== stage) continue;
    pills.all.push(m);
    if (r.mine) (r.fit === "none" ? pills.outside : pills.fits).push(m);
    const top =
      m.number === 1 ||
      m.home === HOME_NATION ||
      m.away === HOME_NATION ||
      r.reasons.includes("topDuel") ||
      m.stage === "qf" ||
      m.stage === "sf" ||
      m.stage === "final";
    if (top) pills.top.push(m);
  }
  pills.results.reverse();
  return pills;
}
