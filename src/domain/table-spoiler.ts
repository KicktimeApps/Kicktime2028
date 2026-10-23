import type { MatchView } from "./types";

/**
 * Spoilerschutz für Tabellen, K.-o.-Baum und Teamliste: Sie verraten alle
 * Ergebnisse auf einmal. „Anzeigen“ merkt sich deshalb den Stand (je Spiel
 * Status und Spielstand). Kommt danach ein neues Ergebnis oder Tor dazu, ist
 * wieder verdeckt – sonst würde der Schutz beim nächsten Spiel nichts nützen.
 */
export function resultKeys(matches: MatchView[]): string[] {
  return matches
    .filter((m) => m.status !== "scheduled" && m.score)
    .map((m) => `${m.id}:${m.status}:${m.score!.home}-${m.score!.away}`);
}

/** Gibt es ein Ergebnis, das der Nutzer weder einzeln noch über die Tabellen gesehen hat? */
export function tablesHidden(
  matches: MatchView[],
  seen: readonly string[],
  revealed: Record<string, true>,
): boolean {
  const known = new Set(seen);
  return matches.some(
    (m) =>
      m.status !== "scheduled" &&
      !!m.score &&
      !revealed[m.id] &&
      !known.has(`${m.id}:${m.status}:${m.score.home}-${m.score.away}`),
  );
}
