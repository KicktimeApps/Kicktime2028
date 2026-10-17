import type { GroupLetter } from "@/tournament/types";
import type { MatchView, Score } from "./types";

export type StandingRow = {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Letzte Ergebnisse, älteste zuerst: "W" | "D" | "L". */
  form: Array<"W" | "D" | "L">;
};

type Played = { home: string; away: string; score: Score };

function emptyRow(code: string): StandingRow {
  return {
    code,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    form: [],
  };
}

function tally(teams: string[], games: Played[]): Map<string, StandingRow> {
  const rows = new Map(teams.map((t) => [t, emptyRow(t)]));
  for (const g of games) {
    const h = rows.get(g.home);
    const a = rows.get(g.away);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.goalsFor += g.score.home;
    h.goalsAgainst += g.score.away;
    a.goalsFor += g.score.away;
    a.goalsAgainst += g.score.home;
    const [winner, loser] =
      g.score.home > g.score.away ? [h, a] : g.score.home < g.score.away ? [a, h] : [null, null];
    if (winner && loser) {
      winner.won++;
      winner.points += 3;
      winner.form.push("W");
      loser.lost++;
      loser.form.push("L");
    } else {
      for (const r of [h, a]) {
        r.drawn++;
        r.points++;
        r.form.push("D");
      }
    }
  }
  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return rows;
}

/**
 * Sortiert punktgleiche Teams nach UEFA-Reglement (EURO 2024/2028):
 *  a) Punkte im direkten Vergleich
 *  b) Tordifferenz im direkten Vergleich
 *  c) Tore im direkten Vergleich
 *  d) a–c erneut nur für die weiterhin gleichen Teams
 *  e) Tordifferenz insgesamt
 *  f) Tore insgesamt
 *  Fair-Play-Wertung und Quali-Ranking sind nicht abbildbar → Kürzel als
 *  deterministischer Fallback.
 */
function resolveTie(tied: string[], all: Map<string, StandingRow>, games: Played[]): string[] {
  if (tied.length <= 1) return tied;
  const h2hGames = games.filter((g) => tied.includes(g.home) && tied.includes(g.away));
  const h2h = tally(tied, h2hGames);
  const key = (c: string) => {
    const r = h2h.get(c)!;
    return [r.points, r.goalDiff, r.goalsFor];
  };
  const sorted = [...tied].sort((x, y) => compareKeys(key(y), key(x)));
  // In Untergruppen mit identischem H2H-Schlüssel zerlegen.
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && compareKeys(key(sorted[i]), key(sorted[j])) === 0) j++;
    const block = sorted.slice(i, j);
    if (block.length === 1) {
      out.push(block[0]);
    } else if (block.length < tied.length) {
      // d) Kriterien a–c nur auf die verbleibenden Teams erneut anwenden
      out.push(...resolveTie(block, all, games));
    } else {
      // e/f) Gesamtbilanz
      out.push(
        ...block.sort((x, y) => {
          const rx = all.get(x)!;
          const ry = all.get(y)!;
          return ry.goalDiff - rx.goalDiff || ry.goalsFor - rx.goalsFor || x.localeCompare(y);
        }),
      );
    }
    i = j;
  }
  return out;
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export type GroupTable = {
  group: GroupLetter;
  rows: StandingRow[];
  /** Alle Gruppenspiele beendet (mit Ergebnis). */
  complete: boolean;
  /** Teams stehen fest (Auslosung erfolgt). */
  drawn: boolean;
};

/**
 * Gruppentabelle aus den Spielen einer Gruppe. Laufende Spiele können mit
 * `includeLive` als Zwischenstand einbezogen werden („Live-Tabelle“).
 */
export function groupTable(
  group: GroupLetter,
  matches: MatchView[],
  opts: { includeLive?: boolean } = {},
): GroupTable {
  const groupMatches = matches.filter((m) => m.stage === "group" && m.group === group);
  const teams = Array.from(
    new Set(groupMatches.flatMap((m) => [m.home, m.away]).filter((c): c is string => !!c)),
  );
  const games: Played[] = [];
  for (const m of groupMatches) {
    if (!m.home || !m.away || !m.score) continue;
    if (m.status === "finished" || (opts.includeLive && m.status === "live")) {
      games.push({ home: m.home, away: m.away, score: m.score });
    }
  }
  const all = tally(teams, games);
  // Nach Punkten gruppieren, Gleichstände nach Reglement auflösen.
  const byPoints = new Map<number, string[]>();
  for (const r of all.values()) {
    const list = byPoints.get(r.points) ?? [];
    list.push(r.code);
    byPoints.set(r.points, list);
  }
  // Vor dem ersten Spiel: Auslosungsreihenfolge (A1..A4) statt alphabetisch.
  const order =
    games.length === 0
      ? teams
      : [...byPoints.keys()]
          .sort((a, b) => b - a)
          .flatMap((pts) => resolveTie(byPoints.get(pts)!.sort(), all, games));

  const complete =
    groupMatches.length > 0 &&
    groupMatches.every((m) => m.status === "finished" && !!m.score && !!m.home && !!m.away);
  return {
    group,
    rows: order.map((c) => all.get(c)!),
    complete,
    drawn: teams.length === 4,
  };
}

export type ThirdPlaceRow = StandingRow & { group: GroupLetter; qualified: boolean };

/**
 * Rangliste der Gruppendritten (UEFA): Punkte, Tordifferenz, Tore, Siege.
 * Die besten `count` qualifizieren sich – aber erst final, wenn alle Gruppen
 * abgeschlossen sind.
 */
export function rankThirds(tables: GroupTable[], count: number): ThirdPlaceRow[] {
  const thirds = tables
    .filter((t) => t.rows.length >= 3)
    .map((t) => ({ ...t.rows[2], group: t.group }));
  thirds.sort(
    (x, y) =>
      y.points - x.points ||
      y.goalDiff - x.goalDiff ||
      y.goalsFor - x.goalsFor ||
      y.won - x.won ||
      x.group.localeCompare(y.group),
  );
  return thirds.map((r, i) => ({ ...r, qualified: i < count }));
}
