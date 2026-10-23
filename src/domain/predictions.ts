import type { Stage } from "@/tournament/types";
import type { MatchView, Score } from "./types";

export type Prediction = { home: number; away: number; createdAt: number };
export type PredictionResult = "exact" | "diff" | "tendency" | "miss";

export const RESULT_LABEL: Record<PredictionResult, string> = {
  exact: "Volltreffer",
  diff: "Tordifferenz",
  tendency: "Tendenz",
  miss: "Daneben",
};

export const RESULT_POINTS: Record<PredictionResult, number> = {
  exact: 4,
  diff: 3,
  tendency: 2,
  miss: 0,
};

/** Halbfinale und Finale zählen doppelt – damit es bis zum Schluss spannend bleibt. */
export const STAGE_MULTIPLIER: Record<Stage, number> = {
  group: 1,
  r16: 1,
  qf: 1,
  sf: 2,
  final: 2,
};

/** Bonus für den richtigen Europameister-Tipp (abzugeben bis zum Eröffnungsspiel). */
export const CHAMPION_BONUS = 10;

/**
 * Punkte für einen Tipp:
 *  - 4 exaktes Ergebnis
 *  - 3 richtige Tordifferenz – nicht bei Unentschieden (sonst wäre jedes
 *    Remis-Tipp automatisch „Tordifferenz“)
 *  - 2 richtige Tendenz (Sieg/Unentschieden/Niederlage)
 *  - 0 sonst
 * Halbfinale und Finale doppelt. Gewertet wird nach 90 bzw. 120 Minuten,
 * ohne Elfmeterschießen.
 */
export function scorePrediction(
  pred: Pick<Score, "home" | "away">,
  actual: Score,
  stage: Stage = "group",
): { result: PredictionResult; points: number } {
  const dp = pred.home - pred.away;
  const da = actual.home - actual.away;
  let result: PredictionResult = "miss";
  if (pred.home === actual.home && pred.away === actual.away) result = "exact";
  else if (dp === da && da !== 0) result = "diff";
  else if (Math.sign(dp) === Math.sign(da)) result = "tendency";
  return { result, points: RESULT_POINTS[result] * STAGE_MULTIPLIER[stage] };
}

/** Tipps sind bis zum Anpfiff möglich. */
export function canPredict(m: MatchView, now: number): boolean {
  return m.status === "scheduled" && now < Date.parse(m.kickoffUtc) && !!m.home && !!m.away;
}

export type PredictionSummary = {
  total: number;
  rated: number;
  open: number;
  points: number;
  counts: Record<PredictionResult, number>;
  hitRate: number;
};

export function summarize(
  predictions: Record<string, Prediction>,
  matches: MatchView[],
): PredictionSummary {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const counts: Record<PredictionResult, number> = { exact: 0, diff: 0, tendency: 0, miss: 0 };
  let rated = 0;
  let open = 0;
  let points = 0;
  for (const [id, p] of Object.entries(predictions)) {
    const m = byId.get(id);
    if (!m) continue;
    if (m.status === "finished" && m.score) {
      const r = scorePrediction(p, m.score, m.stage);
      rated++;
      points += r.points;
      counts[r.result]++;
    } else {
      open++;
    }
  }
  return {
    total: rated + open,
    rated,
    open,
    points,
    counts,
    hitRate: rated === 0 ? 0 : (rated - counts.miss) / rated,
  };
}

/* ------------------------------------------------------------------ */
/* Tipprunde: Tabelle                                                  */
/* ------------------------------------------------------------------ */

export type BoardMember = {
  id: string;
  name: string;
  /** Tipps je Match-ID (bei anderen nur Spiele, die schon angepfiffen sind). */
  tips: Record<string, Pick<Score, "home" | "away">>;
  champion?: string | null;
};

export type BoardRow = {
  id: string;
  name: string;
  rank: number;
  points: number;
  exact: number;
  /** Treffer mit mindestens richtiger Tendenz. */
  hits: number;
  rated: number;
  championPoints: number;
  /** Davon vorläufig: Punkte aus laufenden Spielen (nur mit `live`). */
  livePoints: number;
  /** Mindestens ein getipptes Spiel läuft gerade und zählt vorläufig mit. */
  hasLive: boolean;
};

/** Zählt für die Tabelle: beendet – oder (vorläufig) laufend mit Zwischenstand. */
export function isRated(m: MatchView, live: boolean): boolean {
  return !!m.score && (m.status === "finished" || (live && m.status === "live"));
}

/**
 * Tabelle einer Tipprunde. Sortierung: Punkte, dann Volltreffer, dann
 * richtige Tendenzen; wer überall gleich ist, teilt sich den Platz.
 * `counts` entscheidet, welche beendeten Spiele mitzählen (Spoilerschutz).
 * Mit `live` zählen laufende Spiele mit dem Zwischenstand vorläufig mit.
 */
export function buildBoard(
  members: BoardMember[],
  matches: MatchView[],
  opts: { counts?: (m: MatchView) => boolean; champion?: string | null; live?: boolean } = {},
): BoardRow[] {
  const rated = matches.filter(
    (m) => isRated(m, !!opts.live) && (opts.counts ? opts.counts(m) : true),
  );
  const rows = members.map((mem) => {
    let points = 0;
    let exact = 0;
    let hits = 0;
    let count = 0;
    let livePoints = 0;
    let hasLive = false;
    for (const m of rated) {
      const t = mem.tips[m.id];
      if (!t) continue;
      const r = scorePrediction(t, m.score!, m.stage);
      count++;
      points += r.points;
      if (m.status === "live") {
        hasLive = true;
        livePoints += r.points;
      }
      if (r.result === "exact") exact++;
      if (r.result !== "miss") hits++;
    }
    const championPoints = opts.champion && mem.champion === opts.champion ? CHAMPION_BONUS : 0;
    return {
      id: mem.id,
      name: mem.name,
      rank: 0,
      points: points + championPoints,
      exact,
      hits,
      rated: count,
      championPoints,
      livePoints,
      hasLive,
    };
  });
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.exact - a.exact ||
      b.hits - a.hits ||
      a.name.localeCompare(b.name, "de"),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank =
      prev && prev.points === r.points && prev.exact === r.exact && prev.hits === r.hits
        ? prev.rank
        : i + 1;
  });
  return rows;
}
