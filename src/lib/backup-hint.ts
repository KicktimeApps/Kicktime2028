/** So viele Tage vor dem Eröffnungsspiel erinnert die App noch einmal an den Code. */
export const REMINDER_DAYS = 14;

type HintState = { done: boolean; seen: boolean; reminded: boolean };

/**
 * Welcher Hinweis „Code sichern“ in der Rundenliste erscheint: zuerst einmalig
 * („first“), dann – wer den Code nie angesehen, sondern nur weggeklickt hat –
 * noch einmal kurz vor und während des Turniers („reminder“).
 */
export function backupHint(
  s: HintState,
  now: number,
  tournament: { start: string; end: string },
): "first" | "reminder" | null {
  if (!s.done) return "first";
  if (s.seen || s.reminded) return null;
  const start = Date.parse(tournament.start);
  const inWindow = now >= start - REMINDER_DAYS * 86_400_000 && now < Date.parse(tournament.end);
  return inWindow ? "reminder" : null;
}
