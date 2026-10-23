/**
 * Versteckter Zugang zum KickTime-Team-Bereich: 5× schnell auf die
 * Versionszeile tippen. Zwischen zwei Tippern höchstens 1,5 Sekunden, sonst
 * beginnt die Zählung neu. Nach dem Öffnen startet sie wieder bei null.
 */
export type TapState = { n: number; t: number };

export const SECRET_TAPS = 5;
export const SECRET_GAP_MS = 1500;

export function nextTap(state: TapState, now: number): { state: TapState; open: boolean } {
  const n = now - state.t > SECRET_GAP_MS ? 1 : state.n + 1;
  if (n >= SECRET_TAPS) return { state: { n: 0, t: now }, open: true };
  return { state: { n, t: now }, open: false };
}
