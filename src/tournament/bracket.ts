import type { GroupLetter } from "./types";

/**
 * Zuordnung der vier besten Gruppendritten zu den Achtelfinal-Gegnern
 * (UEFA-Reglement, 15 mögliche Kombinationen – identisch zur EURO 2024).
 *
 * Schlüssel: die vier Gruppen (alphabetisch), aus denen die weitergekommenen
 * Dritten stammen. Wert: Gegner der Gruppensieger B, C, E und F.
 */
// prettier-ignore
export const THIRD_PLACE_TABLE: Record<string, { "1B": GroupLetter; "1C": GroupLetter; "1E": GroupLetter; "1F": GroupLetter }> = {
  ABCD: { "1B": "A", "1C": "D", "1E": "B", "1F": "C" },
  ABCE: { "1B": "A", "1C": "E", "1E": "B", "1F": "C" },
  ABCF: { "1B": "A", "1C": "F", "1E": "B", "1F": "C" },
  ABDE: { "1B": "D", "1C": "E", "1E": "A", "1F": "B" },
  ABDF: { "1B": "D", "1C": "F", "1E": "A", "1F": "B" },
  ABEF: { "1B": "E", "1C": "F", "1E": "B", "1F": "A" },
  ACDE: { "1B": "E", "1C": "D", "1E": "C", "1F": "A" },
  ACDF: { "1B": "F", "1C": "D", "1E": "C", "1F": "A" },
  ACEF: { "1B": "E", "1C": "F", "1E": "C", "1F": "A" },
  ADEF: { "1B": "E", "1C": "F", "1E": "D", "1F": "A" },
  BCDE: { "1B": "E", "1C": "D", "1E": "B", "1F": "C" },
  BCDF: { "1B": "F", "1C": "D", "1E": "C", "1F": "B" },
  BCEF: { "1B": "F", "1C": "E", "1E": "C", "1F": "B" },
  BDEF: { "1B": "F", "1C": "E", "1E": "D", "1F": "B" },
  CDEF: { "1B": "F", "1C": "E", "1E": "D", "1F": "C" },
};

/**
 * Welcher Gruppensieger trifft im jeweiligen Achtelfinale auf einen Dritten?
 * Spielnummer → Gruppensieger-Slot.
 */
export const THIRD_PLACE_MATCHES: Record<number, "1B" | "1C" | "1E" | "1F"> = {
  39: "1B",
  40: "1C",
  41: "1F",
  44: "1E",
};

/**
 * Darstellung des K.-o.-Baums: linke und rechte Hälfte, jeweils von außen
 * (Achtelfinale) nach innen (Halbfinale). Reihenfolge so gewählt, dass die
 * Linien im Baum sich nicht kreuzen.
 */
export const BRACKET_LAYOUT = {
  left: { r16: [39, 37, 41, 42], qf: [45, 46], sf: [49] },
  right: { r16: [44, 43, 40, 38], qf: [47, 48], sf: [50] },
  final: 51,
} as const;
