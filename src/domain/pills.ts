import { recommend, type Prefs } from "./recommend";
import { currentStage } from "./status";
import type { MatchView } from "./types";

export type PillId = "mine" | "all" | "results";

export type Pills = Record<PillId, MatchView[]>;

/**
 * Teilt die Spiele für die drei Reiter der Startseite auf:
 *
 * - **mine**: anstehende Spiele deiner Teams (bzw. vorgemerkte) – ob sie in
 *   deine Zeit passen, steht an jeder Karte
 * - **all**: alle anstehenden Spiele der laufenden Turnierphase
 * - **results**: beendete Spiele deiner Teams, neueste zuerst
 *
 * Laufende Spiele stehen darüber unter „Jetzt live“, das nächste eigene Spiel
 * in der großen Box – beide fehlen hier bewusst, damit nichts doppelt steht.
 */
export function buildPills(
  matches: MatchView[],
  prefs: Prefs,
  opts: { exclude?: string | null } = {},
): Pills {
  const stage = currentStage(matches);
  const pills: Pills = { mine: [], all: [], results: [] };
  for (const m of matches) {
    const r = recommend(m, prefs);
    if (m.status === "finished") {
      if (r.mine) pills.results.push(m);
      continue;
    }
    if (m.status !== "scheduled") continue;
    if (r.mine && m.id !== opts.exclude) pills.mine.push(m);
    if (m.stage === stage) pills.all.push(m);
  }
  pills.results.reverse();
  return pills;
}
