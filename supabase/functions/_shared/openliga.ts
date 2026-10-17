// OpenLigaDB → normalisiertes Spiel. Spiegelbild von src/domain/live.ts
// (fromOpenLiga) – bei Änderungen beide Stellen anpassen.

export type Score = { home: number; away: number };
export type LiveFixture = {
  externalId: string;
  kickoffUtc?: string;
  city?: string | null;
  stadium?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  status: "scheduled" | "live" | "finished";
  score?: Score;
  penalties?: Score;
  phase?: "first" | "half" | "second" | "extra" | "penalties";
  minute?: number;
};

type OlResult = { pointsTeam1: number; pointsTeam2: number; resultTypeID?: number; resultTypeKind?: string };
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
  const last = goals[goals.length - 1];
  const fromGoals = last ? { home: last.scoreTeam1, away: last.scoreTeam2 } : undefined;

  let status: LiveFixture["status"] = "scheduled";
  if (m.matchIsFinished) status = "finished";
  else if (!Number.isNaN(kickoff) && now >= kickoff) status = "live";
  if (!Number.isNaN(kickoff) && kickoff > now) status = "scheduled";

  let score: Score | undefined;
  let penalties: Score | undefined;
  if (status === "finished") {
    score = afterEt ?? after90 ?? fromGoals;
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

  let phase: LiveFixture["phase"];
  let minute: number | undefined;
  if (status === "live" && !Number.isNaN(kickoff)) {
    minute = Math.max(1, Math.floor((now - kickoff) / 60_000));
    phase = minute < 47 ? "first" : minute < 62 ? "half" : minute <= 112 ? "second" : "extra";
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
