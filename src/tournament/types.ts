/**
 * Turnier-unabhängige Grundtypen.
 *
 * Alles, was ein konkretes Turnier beschreibt (Teams, Stadien, Spielplan,
 * K.-o.-Regeln, TV-Rechte), lebt in `src/tournament/*` und wird über diese
 * Typen an die Domain-Logik (`src/domain/*`) übergeben. Für ein künftiges
 * Turnier (z. B. WM 2030) müssen nur die Daten-Dateien ausgetauscht werden.
 */

export type GroupLetter = "A" | "B" | "C" | "D" | "E" | "F";

export type Stage = "group" | "r16" | "qf" | "sf" | "final";

export type Nation = {
  /** FIFA-Kürzel, z. B. "GER". Interner Primärschlüssel. */
  code: string;
  /** Deutscher Anzeigename. */
  name: string;
  /** Kurzname für enge Layouts (max. ~10 Zeichen). */
  short: string;
  /** Dateiname der Flagge in /public/flags (ISO 3166-1 alpha-2, ggf. "gb-eng"). */
  flag: string;
  /** Grobe sportliche Einordnung: 1 = Titelkandidat, 2 = stark, 3 = Rest. */
  tier: 1 | 2 | 3;
  /** Gewonnene EM-Titel als Turnierbezeichnung (EURO 2020 wurde 2021 gespielt). */
  euroTitles: number[];
  /** Co-Gastgeber der EM 2028. */
  host?: boolean;
  /** Weitere Schreibweisen (Live-Daten-Mapping), klein geschrieben. */
  aliases: string[];
};

export type Venue = {
  id: string;
  /** Gebräuchlicher Stadionname. */
  name: string;
  /** Neutraler Turniername laut UEFA (Sponsorennamen sind bei der EM tabu). */
  uefaName: string;
  city: string;
  country: "ENG" | "SCO" | "WAL" | "IRL";
  capacity: number;
  /** IANA-Zeitzone der Spielstätte – für die Anzeige der Ortszeit. */
  timeZone: string;
  airport: string;
  transit: string;
  climate: string;
};

/**
 * Referenz auf einen Teilnehmer, solange er noch nicht feststeht:
 *  - "A1".."F4"   Auslosungs-Slot in der Gruppe
 *  - "1A" / "2C"  Gruppensieger / -zweiter
 *  - "3ADEF"      ein Gruppendritter aus den genannten Gruppen
 *  - "W37"        Sieger von Spiel 37
 */
export type SlotRef = string;

export type FixtureDef = {
  /** Offizielle Spielnummer (1..51). */
  number: number;
  stage: Stage;
  group?: GroupLetter;
  /** Spieltag in der Gruppenphase (1..3). */
  matchday?: 1 | 2 | 3;
  home: SlotRef;
  away: SlotRef;
  venueId: string;
  /** Anstoß in UTC (ISO 8601). */
  kickoffUtc: string;
  /** false = Datum steht fest, Uhrzeit ist nur ein Platzhalter-Slot. */
  kickoffConfirmed: boolean;
};

export type FreeTv = "ARD" | "ZDF";
