import type { MatchView } from "./types";

export const ALARM_LEAD_MINUTES = 15;

/**
 * Erinnerungen, dreiwertig:
 *  alarms[id] === true  → bewusst an
 *  alarms[id] === false → bewusst aus (übersteuert die Automatik)
 *  fehlt               → Automatik: an für Spiele der Favoriten
 */
export function isAlarmActive(
  m: Pick<MatchView, "id" | "home" | "away">,
  alarms: Record<string, boolean | undefined>,
  autoFavorites: boolean,
  favorites: string[],
): boolean {
  const explicit = alarms[m.id];
  if (explicit !== undefined) return explicit;
  return (
    autoFavorites &&
    ((!!m.home && favorites.includes(m.home)) || (!!m.away && favorites.includes(m.away)))
  );
}
