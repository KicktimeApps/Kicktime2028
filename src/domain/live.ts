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

type OlResult = {
  pointsTeam1: number;
  pointsTeam2: number;
  resultTypeID?: number;
  resultTypeKind?: string;
  resultOrderID?: number;
};
type OlGoal = {
  scoreTeam1: number;
  scoreTeam2: number;
  matchMinute?: number | null;
  isPenalty?: boolean | null;
};
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
    results.find((r) => r.resultTypeKind === kind) ??
    results.find((r) => r.resultTypeID === typeId);
  const toScore = (r?: OlResult): Score | undefined =>
    r && typeof r.pointsTeam1 === "number"
      ? { home: r.pointsTeam1, away: r.pointsTeam2 }
      : undefined;

  // Typ-Nummern wie im echten Feed (EM 2024): 4 = nach Verlängerung, 5 = Elfmeterschießen.
  const pens = toScore(byKind("AfterPenalties", 5));
  const afterEt = toScore(byKind("AfterExtraTime", 4));
  const after90 = toScore(byKind("After90Minutes", 2));
  const half = toScore(byKind("HalfTime", 1));
  // Zwischenstand = Tor mit dem höchsten Gesamtstand (bei Gleichstand das
  // zuletzt gelieferte). Unabhängig von Reihenfolge oder fehlender Minute.
  // Tore aus dem Elfmeterschießen stehen in derselben Liste (Elfmeter ab der
  // 120. Minute) – sie zählen nicht zum Spielstand. Manchmal fehlt die Minute
  // (EM 2024, Portugal – Slowenien); dann zählt ein Elfmeter, der erst nach
  // Ende der Verlängerung (2,5 Std. nach Anpfiff) gemeldet wird, als Schießen.
  const lateByClock = !Number.isNaN(kickoff) && now - kickoff >= 150 * 60_000;
  const isShootout = (g: OlGoal) =>
    g.isPenalty === true && (g.matchMinute == null ? lateByClock : g.matchMinute >= 120);
  const shootout = (m.goals ?? []).some(isShootout);
  let lastGoal: OlGoal | undefined;
  for (const g of m.goals ?? []) {
    if (isShootout(g)) continue;
    if (!lastGoal || g.scoreTeam1 + g.scoreTeam2 >= lastGoal.scoreTeam1 + lastGoal.scoreTeam2)
      lastGoal = g;
  }
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
    // Steht der Stand nach Verlängerung schon fest, läuft das Elfmeterschießen.
    score = afterEt ?? fromGoals ?? after90 ?? half ?? { home: 0, away: 0 };
  }

  let phase: LivePhase | undefined;
  let minute: number | undefined;
  if (status === "live" && !Number.isNaN(kickoff)) {
    minute = Math.max(1, Math.floor((now - kickoff) / 60_000));
    phase =
      minute < 47
        ? "first"
        : minute < 62
          ? "half"
          : minute <= MATCH_MS / 60_000
            ? "second"
            : "extra";
    if (shootout || afterEt) phase = "penalties";
  }

  return {
    externalId: String(m.matchID),
    kickoffUtc: Number.isNaN(kickoff)
      ? undefined
      : new Date(kickoff).toISOString().replace(".000Z", "Z"),
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
/* ESPN (Zweitquelle, kostenlos, ohne Schlüssel)                       */
/* ------------------------------------------------------------------ */

type EspnCompetitor = {
  homeAway?: string;
  score?: string | number;
  shootoutScore?: number | string | null;
  team?: { displayName?: string; name?: string; location?: string } | null;
};
export type EspnEvent = {
  id: string | number;
  date?: string;
  status?: { displayClock?: string; type?: { name?: string; state?: string } };
  competitions?: {
    venue?: { fullName?: string; address?: { city?: string } } | null;
    competitors?: EspnCompetitor[];
  }[];
};

const ESPN_PHASE: Record<string, LivePhase> = {
  STATUS_FIRST_HALF: "first",
  STATUS_HALFTIME: "half",
  STATUS_SECOND_HALF: "second",
  STATUS_END_OF_REGULATION: "extra",
  STATUS_OVERTIME: "extra",
  STATUS_FIRST_HALF_EXTRA_TIME: "extra",
  STATUS_HALFTIME_ET: "extra",
  STATUS_SECOND_HALF_EXTRA_TIME: "extra",
  STATUS_END_OF_EXTRATIME: "extra",
  STATUS_SHOOTOUT: "penalties",
};

/**
 * ESPN-Spiel → LiveFixture. ESPN meldet Tore meist schneller als OpenLigaDB,
 * ist aber eine inoffizielle Schnittstelle – darum nur Zweitquelle
 * (siehe mergeLiveResults). Spiegelbild in supabase/functions/live-scores.
 */
export function fromEspn(e: EspnEvent, now: number): LiveFixture {
  const kickoff = e.date ? Date.parse(e.date) : NaN;
  const comp = e.competitions?.[0];
  const teams = comp?.competitors ?? [];
  const home = teams.find((t) => t.homeAway === "home") ?? teams[0];
  const away = teams.find((t) => t.homeAway === "away") ?? teams[1];
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  const name = e.status?.type?.name ?? "";
  const state = e.status?.type?.state;
  let status: MatchStatus = "scheduled";
  // Abgesagt/verlegt/abgebrochen: lieber nichts melden als etwas Falsches.
  if (/CANCEL|POSTPONED|ABANDON|DELAYED|SUSPENDED/.test(name)) status = "scheduled";
  else if (state === "post") status = "finished";
  else if (state === "in") status = "live";
  if (!Number.isNaN(kickoff) && kickoff > now) status = "scheduled";

  const h = num(home?.score);
  const a = num(away?.score);
  let score: Score | undefined;
  let penalties: Score | undefined;
  if (status !== "scheduled") {
    score = { home: h ?? 0, away: a ?? 0 };
    const ph = num(home?.shootoutScore);
    const pa = num(away?.shootoutScore);
    if (ph != null && pa != null && (ph > 0 || pa > 0)) penalties = { home: ph, away: pa };
  }
  let phase: LivePhase | undefined;
  let minute: number | undefined;
  if (status === "live") {
    phase = ESPN_PHASE[name];
    const clock = num(e.status?.displayClock);
    if (clock != null && clock > 0) minute = clock;
    else if (!Number.isNaN(kickoff)) minute = Math.max(1, Math.floor((now - kickoff) / 60_000));
    phase ??= minute != null && minute > 45 ? "second" : "first";
  }
  const teamName = (t?: EspnCompetitor) =>
    t?.team?.displayName ?? t?.team?.location ?? t?.team?.name ?? null;
  return {
    externalId: `espn-${e.id}`,
    kickoffUtc: Number.isNaN(kickoff)
      ? undefined
      : new Date(kickoff).toISOString().replace(".000Z", "Z"),
    city: comp?.venue?.address?.city ?? null,
    stadium: comp?.venue?.fullName ?? null,
    homeName: teamName(home),
    awayName: teamName(away),
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
    // Gruppengegner können sich ab dem Viertelfinale wiedersehen – bei
    // mehreren Treffern gewinnt das Spiel mit der nächstgelegenen Anstoßzeit.
    const t = f.kickoffUtc ? Date.parse(f.kickoffUtc) : NaN;
    let best: { num: number; diff: number } | null = null;
    for (const [num, teams] of resolvedTeams) {
      const same =
        (teams.home === home && teams.away === away) ||
        (teams.home === away && teams.away === home);
      if (!same) continue;
      const def = fixtures.find((x) => x.number === num);
      const diff = def && !Number.isNaN(t) ? Math.abs(Date.parse(def.kickoffUtc) - t) : 0;
      if (!best || diff < best.diff) best = { num, diff };
    }
    if (best) return best.num;
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

/** Spätestens so lange nach Anpfiff gilt ein „live“ gemeldetes Spiel als beendet. */
const STALE_LIVE_MS = 4 * 60 * 60_000;

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
    // K.-o.-Phase: Meldet die Quelle eine andere Paarung als berechnet, gilt
    // die Quelle (Fair-Play-Wertung u. Ä. rechnen wir nicht nach). In der
    // Gruppenphase bleibt die Auslosung maßgeblich, die Quelle füllt nur Lücken.
    const ko = def.stage !== "group" && !!home && !!away && home !== away && !flipped;
    if (ko && (home !== known?.home || away !== known?.away)) {
      patch.home = home;
      patch.away = away;
    } else if (!flipped) {
      if (home && !known?.home) patch.home = home;
      if (away && !known?.away) patch.away = away;
    }
    // Offizielle Uhrzeit übernehmen, aber nur am selben Spieltag – auch wenn
    // sie der vorläufigen entspricht, damit das Spiel als bestätigt gilt.
    if (f.kickoffUtc && ukDay(f.kickoffUtc) === ukDay(def.kickoffUtc)) {
      patch.kickoffUtc = f.kickoffUtc;
    }
    if (Object.keys(patch).length > 0) patches[id] = patch;
    if (f.status !== "scheduled") {
      // Vergisst die Quelle das Spielende, gilt ein Spiel spätestens 4 Stunden
      // nach Anpfiff als beendet (sonst bliebe es ewig „live“).
      const kickoff = Date.parse(f.kickoffUtc ?? def.kickoffUtc);
      const stale = f.status === "live" && now - kickoff > STALE_LIVE_MS;
      // Verlängerung gibt es nur in der K.-o.-Phase.
      const phase = f.phase === "extra" && def.stage === "group" ? "second" : f.phase;
      results[id] = {
        status: stale ? "finished" : f.status,
        score: flip(f.score),
        penalties: flip(f.penalties),
        phase: stale ? undefined : phase,
        minute: stale ? undefined : f.minute,
        source: "api",
        updatedAt: now,
      };
    }
  }
  return { results, patches, unmatched };
}

const STATUS_RANK: Record<MatchStatus, number> = { scheduled: 0, live: 1, finished: 2 };

/**
 * Führt Hauptquelle (OpenLigaDB) und Zweitquelle (ESPN) zusammen:
 *  - Meldet nur eine Quelle etwas, gilt diese.
 *  - Ist eine Quelle weiter (live statt geplant, beendet statt live), gilt sie –
 *    so springt die App nicht zurück, wenn OpenLigaDB hinterherhängt.
 *  - Beide live → Zweitquelle (aktueller Spielstand/Minute).
 *  - Beide beendet → Hauptquelle (wird auch dauerhaft gespeichert).
 * Teams/Anstoßzeiten: Hauptquelle zuerst, Zweitquelle füllt nur Lücken.
 */
export function mergeLiveResults(
  primary: LiveApplyResult,
  backup: LiveApplyResult,
): LiveApplyResult {
  const patches = { ...primary.patches };
  for (const [id, b] of Object.entries(backup.patches)) patches[id] = { ...b, ...patches[id] };
  const results = { ...primary.results };
  for (const [id, b] of Object.entries(backup.results)) {
    const p = results[id];
    if (
      !p ||
      STATUS_RANK[b.status] > STATUS_RANK[p.status] ||
      (b.status === "live" && p.status === "live")
    ) {
      // Beide Quellen setzen die Teams, aber mit Heim/Gast vertauscht → der
      // Spielstand der Zweitquelle muss zur Paarung der Hauptquelle passen.
      const bp = backup.patches[id];
      const mp = patches[id];
      const swapped = !!bp?.home && !!bp.away && mp?.home === bp.away && mp?.away === bp.home;
      const turn = (s?: Score) => (s && swapped ? { home: s.away, away: s.home } : s);
      results[id] = swapped ? { ...b, score: turn(b.score), penalties: turn(b.penalties) } : b;
    }
  }
  return { results, patches, unmatched: primary.unmatched };
}
