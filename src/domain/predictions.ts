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

/**
 * Klassisches Kicktipp-Schema: 4 Punkte für das exakte Ergebnis, 3 für die
 * richtige Tordifferenz, 2 für die richtige Tendenz. Gewertet wird das
 * Ergebnis nach Verlängerung (ohne Elfmeterschießen).
 */
export function scorePrediction(
  pred: Score,
  actual: Score,
): { result: PredictionResult; points: number } {
  let result: PredictionResult = "miss";
  if (pred.home === actual.home && pred.away === actual.away) result = "exact";
  else if (pred.home - pred.away === actual.home - actual.away) result = "diff";
  else if (Math.sign(pred.home - pred.away) === Math.sign(actual.home - actual.away))
    result = "tendency";
  return { result, points: RESULT_POINTS[result] };
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
      const r = scorePrediction(p, m.score);
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
