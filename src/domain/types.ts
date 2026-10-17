import type { GroupLetter, Stage, Venue } from "@/tournament/types";

export type MatchStatus = "scheduled" | "live" | "finished";

/** Grobe Spielphase statt Minutenanzeige. */
export type LivePhase = "first" | "half" | "second" | "extra" | "penalties";

export type Score = { home: number; away: number };

/**
 * Ergebnis-Datensatz aus einer Quelle (Live-API, Admin-Override, Demo).
 * `score` = Tore inkl. Verlängerung, `penalties` = Elfmeterschießen.
 */
export type ResultRecord = {
  status: MatchStatus;
  score?: Score;
  penalties?: Score;
  phase?: LivePhase;
  minute?: number;
  source: "api" | "admin" | "demo";
  updatedAt: number;
};

/** Zusatzinfos, die eine Live-Quelle zu einem Spiel liefern kann. */
export type FixturePatch = {
  home?: string;
  away?: string;
  kickoffUtc?: string;
};

export type MatchView = {
  id: string;
  number: number;
  stage: Stage;
  group?: GroupLetter;
  matchday?: 1 | 2 | 3;
  slotHome: string;
  slotAway: string;
  /** FIFA-Kürzel oder null, solange nicht feststeht. */
  home: string | null;
  away: string | null;
  venue: Venue;
  kickoffUtc: string;
  kickoffConfirmed: boolean;
  status: MatchStatus;
  score?: Score;
  penalties?: Score;
  phase?: LivePhase;
  minute?: number;
  /** true, wenn Status/Ergebnis aus einer Datenquelle stammt (nicht nur aus der Uhr). */
  hasData: boolean;
  source?: ResultRecord["source"];
};
