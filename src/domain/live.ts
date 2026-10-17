import { nationFromName } from "@/tournament/nations";
import { matchId } from "@/tournament/schedule";
import type { FixtureDef } from "@/tournament/types";
import { getVenue } from "@/tournament/venues";
import { localParts } from "./time";
import type { FixturePatch, LivePhase, MatchStatus, ResultRecord, Score } from "./types";

/**
 * Normalisiertes Spiel aus einer externen Quelle (OpenLigaDB, eigenes
 * Backend). Teamnamen bleiben roh, die Zuordnung passiert in `matchFixture`.
 */
export type LiveFixture = {
  externalId: string;
  kickoffUtc?: string;
  city?: string | null;
  stadium?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  status: MatchStatus;
  score?: Score;
  penalties?: Score;
  phase?: LivePhase;
  minute?: number;
};

/* ------------------------------------------------------------------ */
/* OpenLigaDB                                                          */
/* ------------------------------------------------------------------ */

type OlResult = { pointsTeam1: number; pointsTeam2: number; resultTypeID?: number; resultTypeKind?: string; resultOrderID?: number };
type OlGoal = { scoreTeam1: number; scoreTeam2: number; matchMinute?: number | null };
export type OpenLigaMatch = {
  matchID: number;
  matchDateTimeUTC?: string;
  matchIsFinished?: boolean;
  team1?: { teamName?: string; shortName?: string } | null;
  team2?: { teamName?: string; shortName?: string } | null;
  matchResults?: OlResult[] | null;
  goals?: OlGoal[] | null;
  location?: { locationCity?: string | null; locationStadium?: string | null } | null;
};

const MATCH_MS = 112 * 60_000;

/**
 * OpenLigaDB-Spiel → LiveFixture. OpenLigaDB ist Community-gepflegt; die
 * Daten sind meist gut, aber nicht fehlerfrei (z. B. Testteams). Darum:
 * - Status aus `matchIsFinished` + Uhr ableiten
 * - Ergebnis: Elfmeterschießen separat, Endstand = nach Verlängerung bzw. 90'
 * - Torliste als Fallback für den Live-Zwischenstand
 */
export function fromOpenLiga(m: OpenLigaMatch, now: number): LiveFixture {
  const kickoff = m.matchDateTimeUTC ? Date.parse(m.matchDateTimeUTC) : NaN;
  const results = m.matchResults ?? [];
  const byKind = (kind: string, typeId: number) =>
    results.find((r) => r.resultTypeKind === kind) ?? results.find((r) => r.resultTypeID === typeId);
  const toScore = (r?: OlResult): Score | undefined =>
    r && typeof r.pointsTeam1 === "number" ? { home: r.pointsTeam1, away: r.pointsTeam2 } : undefined;

  const pens = toScore(byKind("AfterPenalties", 5));
  const afterEt = toScore(byKind("AfterExtraTime", 3));
  const after90 = toScore(byKind("After90Minutes", 2));
  const half = toScore(byKind("HalfTime", 1));
  const goals = [...(m.goals ?? [])].sort((a, b) => (a.matchMinute ?? 0) - (b.matchMinute ?? 0));
  const lastGoal = goals[goals.length - 1];
  const fromGoals = lastGoal ? { home: lastGoal.scoreTeam1, away: lastGoal.scoreTeam2 } : undefined;

  let status: MatchStatus = "scheduled";
  if (m.matchIsFinished) status = "finished";
  else if (!Number.isNaN(kickoff) && now >= kickoff) status = "live";
  // Datenfehler-Schutz: Spiele in der Zukunft sind nie live/beendet.
  if (!Number.isNaN(kickoff) && kickoff > now) status = "scheduled";

  let score: Score | undefined;
  let penalties: Score | undefined;
  if (status === "finished") {
    score = afterEt ?? after90 ?? fromGoals;
    // Manche Einträge führen das Elfmeterergebnis als Gesamtstand – nur
    // übernehmen, wenn es vom Spielstand abweicht.
    if (pens && score && score.home === score.away && pens.home !== pens.away) {
      penalties =
        pens.home >= score.home && pens.away >= score.away
          ? { home: pens.home - score.home, away: pens.away - score.away }
          : pens;
      if (penalties.home === penalties.away) penalties = pens;
    }
  } else if (status === "live") {
    score = fromGoals ?? afterEt ?? after90 ?? half ?? { home: 0, away: 0 };
  }

  let phase: LivePhase | undefined;
  let minute: number | undefined;
  if (status === "live" && !Number.isNaN(kickoff)) {
    minute = Math.max(1, Math.floor((now - kickoff) / 60_000));
    phase = minute < 47 ? "first" : minute < 62 ? "half" : minute <= MATCH_MS / 60_000 ? "second" : "extra";
  }

  return {
    externalId: String(m.matchID),
    kickoffUtc: Number.isNaN(kickoff) ? undefined : new Date(kickoff).toISOString().replace(".000Z", "Z"),
    city: m.location?.locationCity ?? null,
    stadium: m.location?.locationStadium ?? null,
    homeName: m.team1?.teamName ?? m.team1?.shortName ?? null,
    awayName: m.team2?.teamName ?? m.team2?.shortName ?? null,
    status,
    score,
    penalties,
    phase,
    minute,
  };
}

/* ------------------------------------------------------------------ */
/* Zuordnung externes Spiel → Spielnummer                              */
/* ------------------------------------------------------------------ */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

const ukDay = (utc: string) => localParts(utc, "Europe/London").dayKey;

/**
 * Findet zu einem externen Spiel die eigene Spielnummer.
 *
 * Strategie (robust auch bei Platzhalter-Teams und vorläufigen Zeiten):
 *  1. Beide Teams bekannt und Paarung existiert im aufgelösten Spielplan
 *  2. Gleicher Spieltag (UK-Datum) + gleiche Stadt/Stadion
 *     – jede Spielstätte hat höchstens ein Spiel pro Tag
 *  3. Gleicher Spieltag + Anstoß weniger als 20 Minuten entfernt
 */
export function matchFixture(
  f: LiveFixture,
  fixtures: FixtureDef[],
  resolvedTeams: Map<number, { home: string | null; away: string | null }>,
): number | null {
  const home = nationFromName(f.homeName);
  const away = nationFromName(f.awayName);
  if (home && away) {
    for (const [num, t] of resolvedTeams) {
      if ((t.home === home && t.away === away) || (t.home === away && t.away === home)) return num;
    }
  }
  if (!f.kickoffUtc) return null;
  const day = ukDay(f.kickoffUtc);
  const sameDay = fixtures.filter((x) => ukDay(x.kickoffUtc) === day);
  if (sameDay.length === 0) return null;

  const place = norm(`${f.city ?? ""} ${f.stadium ?? ""}`);
  if (place) {
    const byPlace = sameDay.filter((x) => {
      const v = getVenue(x.venueId);
      return [v.city, v.name, v.uefaName].some((k) => place.includes(norm(k)));
    });
    if (byPlace.length === 1) return byPlace[0].number;
    // London hat zwei Stadien – über den Stadionnamen unterscheiden.
    const byStadium = byPlace.filter((x) => {
      const v = getVenue(x.venueId);
      return place.includes(norm(v.name)) || place.includes(norm(v.uefaName));
    });
    if (byStadium.length === 1) return byStadium[0].number;
  }

  const t = Date.parse(f.kickoffUtc);
  const close = sameDay.filter((x) => Math.abs(Date.parse(x.kickoffUtc) - t) < 20 * 60_000);
  return close.length === 1 ? close[0].number : null;
}

export type LiveApplyResult = {
  results: Record<string, ResultRecord>;
  patches: Record<string, FixturePatch>;
  unmatched: LiveFixture[];
};

/**
 * Wandelt eine Liste externer Spiele in Ergebnis-Datensätze und Patches
 * (Teams, offizielle Anstoßzeit) um.
 */
export function applyLiveFixtures(
  list: LiveFixture[],
  fixtures: FixtureDef[],
  resolvedTeams: Map<number, { home: string | null; away: string | null }>,
  now: number,
): LiveApplyResult {
  const results: Record<string, ResultRecord> = {};
  const patches: Record<string, FixturePatch> = {};
  const unmatched: LiveFixture[] = [];
  for (const f of list) {
    const num = matchFixture(f, fixtures, resolvedTeams);
    if (num == null) {
      unmatched.push(f);
      continue;
    }
    const id = matchId(num);
    const def = fixtures.find((x) => x.number === num)!;
    const patch: FixturePatch = {};
    const home = nationFromName(f.homeName);
    const away = nationFromName(f.awayName);
    const known = resolvedTeams.get(num);
    // Liefert die Quelle die Teams in umgekehrter Reihenfolge, drehen wir
    // das Ergebnis statt der Paarung.
    const flipped = !!known?.home && !!known?.away && home === known.away && away === known.home;
    const flip = (s?: Score) => (s && flipped ? { home: s.away, away: s.home } : s);
    if (!flipped) {
      if (home && !known?.home) patch.home = home;
      if (away && !known?.away) patch.away = away;
    }
    // Offizielle Uhrzeit übernehmen, aber nur am selben Spieltag.
    if (f.kickoffUtc && ukDay(f.kickoffUtc) === ukDay(def.kickoffUtc) && f.kickoffUtc !== def.kickoffUtc) {
      patch.kickoffUtc = f.kickoffUtc;
    }
    if (Object.keys(patch).length > 0) patches[id] = patch;
    if (f.status !== "scheduled") {
      results[id] = {
        status: f.status,
        score: flip(f.score),
        penalties: flip(f.penalties),
        phase: f.phase,
        minute: f.minute,
        source: "api",
        updatedAt: now,
      };
    }
  }
  return { results, patches, unmatched };
}
