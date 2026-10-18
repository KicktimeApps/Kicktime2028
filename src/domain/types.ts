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
  /**
   * Nur Admin-Korrekturen: Stand der Live-Quelle beim Speichern (siehe
   * {@link resultSignature}). Weicht die Quelle davon ab, gilt wieder sie.
   */
  sourceSig?: string;
};

/**
 * Kurzform eines Live-Stands: beendet ja/nein, Tore, Elfmeter. Spielphase und
 * „geplant/live“ fehlen bewusst – beides wird teils aus der Uhr abgeleitet und
 * ändert sich, ohne dass die Quelle Neues meldet. „Noch nichts“ und „live 0:0“
 * sind deshalb gleich.
 */
export function resultSignature(r: ResultRecord | undefined): string {
  const done = r?.status === "finished" ? "F" : "O";
  const s = r?.score ? `${r.score.home}:${r.score.away}` : "0:0";
  const p = r?.penalties ? `${r.penalties.home}:${r.penalties.away}` : "-";
  return `${done}|${s}|${p}`;
}

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
