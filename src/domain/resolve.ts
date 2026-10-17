import { THIRD_PLACE_MATCHES, THIRD_PLACE_TABLE } from "@/tournament/bracket";
import { KO_MATCH_WINDOW_MIN, MATCH_WINDOW_MIN, TOURNAMENT } from "@/tournament/config";
import { isNationCode } from "@/tournament/nations";
import { matchId } from "@/tournament/schedule";
import type { FixtureDef, GroupLetter } from "@/tournament/types";
import { getVenue } from "@/tournament/venues";
import { groupTable, rankThirds, type GroupTable } from "./standings";
import type { FixturePatch, MatchView, ResultRecord } from "./types";

export type ResolveInput = {
  fixtures: FixtureDef[];
  /** Auslosung: Slot (A1..F4) → FIFA-Kürzel. */
  draw: Partial<Record<string, string>>;
  /** Ergebnisse je Match-ID. */
  results: Record<string, ResultRecord | undefined>;
  /** Teams/Anstoß aus Live-Daten je Match-ID. */
  patches: Record<string, FixturePatch | undefined>;
  now: number;
};

export type TournamentState = {
  matches: MatchView[];
  tables: GroupTable[];
  /** Alle Gruppen beendet → Achtelfinale steht. */
  groupStageComplete: boolean;
  /** Gruppen, aus denen die vier besten Dritten kommen (sobald feststehend). */
  qualifiedThirdGroups: GroupLetter[] | null;
};

/** Sieger eines beendeten Spiels (inkl. Elfmeterschießen) oder null. */
export function winnerOf(
  m: Pick<MatchView, "status" | "home" | "away" | "score" | "penalties">,
): string | null {
  if (m.status !== "finished" || !m.score || !m.home || !m.away) return null;
  if (m.score.home > m.score.away) return m.home;
  if (m.score.away > m.score.home) return m.away;
  if (m.penalties && m.penalties.home !== m.penalties.away) {
    return m.penalties.home > m.penalties.away ? m.home : m.away;
  }
  return null;
}

export function loserOf(
  m: Pick<MatchView, "status" | "home" | "away" | "score" | "penalties">,
): string | null {
  const w = winnerOf(m);
  if (!w) return null;
  return w === m.home ? m.away : m.home;
}

function deriveStatus(
  fixture: FixtureDef,
  kickoffUtc: string,
  confirmed: boolean,
  result: ResultRecord | undefined,
  now: number,
): Pick<MatchView, "status" | "score" | "penalties" | "phase" | "minute" | "hasData" | "source"> {
  if (result) {
    return {
      status: result.status,
      score: result.score,
      penalties: result.penalties,
      phase: result.status === "live" ? result.phase : undefined,
      minute: result.status === "live" ? result.minute : undefined,
      hasData: true,
      source: result.source,
    };
  }
  // Ohne Datenquelle: Status allein aus der Uhr ableiten – aber niemals ein
  // Ergebnis erfinden (kein fiktives 0:0).
  const kickoff = Date.parse(kickoffUtc);
  const windowMin = fixture.stage === "group" ? MATCH_WINDOW_MIN : KO_MATCH_WINDOW_MIN;
  if (!confirmed) {
    // Vorläufige Uhrzeit: erst nach Ende des Spieltags als beendet werten.
    const endOfDay = kickoff + 8 * 3_600_000;
    return { status: now >= endOfDay ? "finished" : "scheduled", hasData: false };
  }
  if (now < kickoff) return { status: "scheduled", hasData: false };
  if (now < kickoff + windowMin * 60_000) return { status: "live", hasData: false };
  return { status: "finished", hasData: false };
}

/**
 * Baut aus statischem Spielplan, Auslosung, Ergebnissen und Live-Patches den
 * vollständigen Turnierzustand. Rein funktional – leicht testbar.
 *
 * Reihenfolge: Gruppenspiele → Tabellen → beste Dritte → K.-o.-Runden in
 * Spielnummer-Reihenfolge (Sieger früherer Spiele stehen dann schon fest).
 */
export function resolveTournament(input: ResolveInput): TournamentState {
  const { fixtures, draw, results, patches, now } = input;
  const views = new Map<number, MatchView>();

  const build = (f: FixtureDef, home: string | null, away: string | null): MatchView => {
    const id = matchId(f.number);
    const patch = patches[id];
    const kickoffUtc = patch?.kickoffUtc ?? f.kickoffUtc;
    const confirmed = f.kickoffConfirmed || !!patch?.kickoffUtc;
    return {
      id,
      number: f.number,
      stage: f.stage,
      group: f.group,
      matchday: f.matchday,
      slotHome: f.home,
      slotAway: f.away,
      home,
      away,
      venue: getVenue(f.venueId),
      kickoffUtc,
      kickoffConfirmed: confirmed,
      ...deriveStatus(f, kickoffUtc, confirmed, results[id], now),
    };
  };

  const fromPatch = (code: string | undefined) => (code && isNationCode(code) ? code : null);

  // 1) Gruppenphase
  for (const f of fixtures) {
    if (f.stage !== "group") continue;
    const p = patches[matchId(f.number)];
    const home = fromPatch(p?.home) ?? draw[f.home] ?? null;
    const away = fromPatch(p?.away) ?? draw[f.away] ?? null;
    views.set(f.number, build(f, home, away));
  }

  // 2) Tabellen + beste Dritte
  const groupViews = [...views.values()];
  const tables = TOURNAMENT.groups.map((g) => groupTable(g, groupViews));
  const groupStageComplete = tables.every((t) => t.complete);
  const thirds = groupStageComplete ? rankThirds(tables, TOURNAMENT.bestThirds) : [];
  const qualifiedThirdGroups = groupStageComplete
    ? thirds
        .filter((t) => t.qualified)
        .map((t) => t.group)
        .sort()
    : null;
  const thirdAllocation = qualifiedThirdGroups
    ? THIRD_PLACE_TABLE[qualifiedThirdGroups.join("")]
    : undefined;

  const resolveSlot = (slot: string, number: number): string | null => {
    // Gruppenplatzierung "1A"/"2C" – erst wenn die Gruppe abgeschlossen ist.
    const rank = slot.match(/^([12])([A-F])$/);
    if (rank) {
      const t = tables.find((x) => x.group === rank[2]);
      return t?.complete ? (t.rows[Number(rank[1]) - 1]?.code ?? null) : null;
    }
    // Gruppendritter "3ADEF" – erst wenn alle Gruppen fertig sind.
    if (/^3[A-F]+$/.test(slot)) {
      const winnerSlot = THIRD_PLACE_MATCHES[number];
      const group = thirdAllocation && winnerSlot ? thirdAllocation[winnerSlot] : undefined;
      const t = group ? tables.find((x) => x.group === group) : undefined;
      return t?.rows[2]?.code ?? null;
    }
    // Sieger eines früheren Spiels "W37"
    const w = slot.match(/^W(\d+)$/);
    if (w) {
      const prev = views.get(Number(w[1]));
      return prev ? winnerOf(prev) : null;
    }
    return null;
  };

  // 3) K.-o.-Runde
  for (const f of [...fixtures]
    .filter((x) => x.stage !== "group")
    .sort((a, b) => a.number - b.number)) {
    const p = patches[matchId(f.number)];
    const home = fromPatch(p?.home) ?? resolveSlot(f.home, f.number);
    const away = fromPatch(p?.away) ?? resolveSlot(f.away, f.number);
    views.set(f.number, build(f, home, away));
  }

  const matches = [...views.values()].sort(
    (a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.number - b.number,
  );
  return { matches, tables, groupStageComplete, qualifiedThirdGroups };
}
