import { STAGE_LABEL } from "@/tournament/config";
import type { MatchView } from "./types";

/** Tipp-Abschnitte wie bei Kicktipp: drei Spieltage, dann die K.-o.-Runden. */
export type Round = { key: string; label: string; matches: MatchView[] };

export function buildRounds(matches: MatchView[]): Round[] {
  const rounds: Round[] = [1, 2, 3].map((d) => ({
    key: `md${d}`,
    label: `${d}. Spieltag`,
    matches: matches.filter((m) => m.stage === "group" && m.matchday === d),
  }));
  for (const st of ["r16", "qf", "sf", "final"] as const) {
    rounds.push({
      key: st,
      label: STAGE_LABEL[st],
      matches: matches.filter((m) => m.stage === st),
    });
  }
  return rounds
    .filter((r) => r.matches.length > 0)
    .map((r) => ({
      ...r,
      matches: [...r.matches].sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc)),
    }));
}
