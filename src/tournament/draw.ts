/**
 * ════════════════════════════════════════════════════════════════════════
 *  PFLEGE-DATEI – hier werden die Fakten nachgetragen, sobald sie feststehen.
 * ════════════════════════════════════════════════════════════════════════
 *
 * 1. QUALIFIED: FIFA-Kürzel aller Teams, die sich für die Endrunde
 *    qualifiziert haben (Gruppenphase der Quali endet Nov. 2027, Play-offs
 *    März 2028).
 * 2. DRAW: Ergebnis der Endrunden-Auslosung – welches Team auf welchem Slot
 *    (A1..F4) steht. Die Slot-Nummer bestimmt die Spielreihenfolge im
 *    Spielplan (siehe schedule.ts).
 * 3. CONFIRMED_KICKOFFS: offizielle Anstoßzeiten je Spielnummer in UTC.
 *    Solange ein Spiel hier fehlt, zeigt die App eine vorläufige Uhrzeit.
 *
 * Alles hier ist optional – leer bedeutet „steht noch nicht fest“. Die App
 * zeigt dann Platzhalter. Live-Daten (OpenLigaDB) können Teams und Zeiten
 * zusätzlich automatisch ergänzen.
 */

/** Teams mit sicherem Endrunden-Ticket. */
export const QUALIFIED: string[] = [];

/** Teams, die in der Qualifikation endgültig ausgeschieden sind. */
export const ELIMINATED_IN_QUALIFYING: string[] = [];

/** Auslosung der Endrunde: Slot → FIFA-Kürzel. */
export const DRAW: Partial<Record<string, string>> = {};

/** Offizielle Anstoßzeiten: Spielnummer → ISO-UTC, z. B. { 1: "2028-06-09T19:00:00Z" }. */
export const CONFIRMED_KICKOFFS: Record<number, string> = {};

/**
 * Gesetzte Gruppenköpfe laut UEFA – gelten nur, wenn sich der jeweilige
 * Gastgeber qualifiziert. Wird in der App als Hinweis angezeigt.
 */
export const HOST_SLOTS: Record<string, string> = {
  A1: "WAL",
  B1: "ENG",
  E1: "IRL",
  F1: "SCO",
};
