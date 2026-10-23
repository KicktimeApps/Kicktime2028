import type { GroupLetter, Stage } from "./types";

/**
 * Zentrale Turnier-Konfiguration. Für ein anderes Turnier hier und in den
 * Daten-Dateien (nations, venues, schedule, bracket, tv, draw) anpassen.
 */
export const TOURNAMENT = {
  id: "euro2028",
  name: "EURO 2028",
  longName: "UEFA EURO 2028",
  /** Wird in Texten wie „Dein EM-Tag“ verwendet. */
  short: "EM",
  hosts: "England, Schottland, Wales & Irland",
  hostsShort: "UK & Irland",
  year: 2028,
  /** Anstoß Eröffnungsspiel (vorläufig 21:00 MESZ). */
  start: "2028-06-09T19:00:00Z",
  /** Ende des Finaltags. */
  end: "2028-07-09T22:00:00Z",
  teams: 24,
  groups: ["A", "B", "C", "D", "E", "F"] as GroupLetter[],
  /** Anzahl bester Gruppendritter, die weiterkommen. */
  bestThirds: 4,
  /** Persist-Key-Präfix: neues Turnier → neuer Präfix → frischer Zustand. */
  storagePrefix: "kicktime-2028",
} as const;

export const STAGE_ORDER: Stage[] = ["group", "r16", "qf", "sf", "final"];

export const STAGE_LABEL: Record<Stage, string> = {
  group: "Gruppenphase",
  r16: "Achtelfinale",
  qf: "Viertelfinale",
  sf: "Halbfinale",
  final: "Finale",
};

/** Gewichtung für die Empfehlungen – spätere Runden sind spannender. */
export const STAGE_WEIGHT: Record<Stage, number> = {
  group: 0,
  r16: 12,
  qf: 22,
  sf: 32,
  final: 45,
};

/**
 * Wichtige Termine rund ums Turnier. `approx` markiert Termine, die noch
 * nicht offiziell bestätigt sind.
 */
export const MILESTONES: { date: string; label: string; approx?: boolean }[] = [
  { date: "2026-12-06", label: "Auslosung der Qualifikation (Belfast)" },
  { date: "2027-03-26", label: "Start der Qualifikation" },
  { date: "2027-11-16", label: "Letzter Quali-Spieltag" },
  { date: "2027-12-01", label: "Endrunden-Auslosung", approx: true },
  { date: "2028-03-23", label: "Play-offs" },
  { date: "2028-06-09", label: "Eröffnungsspiel in Cardiff" },
  { date: "2028-07-09", label: "Finale im Wembley-Stadion" },
];

/**
 * Live-Daten: OpenLigaDB-Liga (kostenlos, ohne Key). Die EURO 2024 lief unter
 * `em/2024` – für 2028 ist `em/2028` zu erwarten. Über Umgebungsvariablen
 * überschreibbar, falls OpenLigaDB ein anderes Kürzel nutzt.
 */
export const LIVE_SOURCE = {
  league: (import.meta.env?.VITE_OPENLIGA_LEAGUE as string | undefined) || "em",
  season: (import.meta.env?.VITE_OPENLIGA_SEASON as string | undefined) || "2028",
};

/** Öffentliche Basis-URL (für Canonical-Links & Sitemap), optional. */
export const SITE_URL = ((import.meta.env?.VITE_SITE_URL as string | undefined) || "").replace(
  /\/$/,
  "",
);

/** Supportseite 2028 mit Datenschutz (/datenschutz) und Impressum (/impressum). */
export const LEGAL_URL = (
  (import.meta.env?.VITE_LEGAL_URL as string | undefined) ||
  "https://kicktime2028-landingpage.ben-online35.workers.dev"
).replace(/\/$/, "");

/** Dauer eines Spiels inkl. Pause und Puffer – danach gilt es als beendet. */
export const MATCH_WINDOW_MIN = 115;
/** K.-o.-Spiele können Verlängerung + Elfmeterschießen haben. */
export const KO_MATCH_WINDOW_MIN = 160;
