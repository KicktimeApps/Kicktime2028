import { useEffect } from "react";
import { toast } from "sonner";
import type { MatchView } from "@/domain/types";
import { useAppStore } from "@/store/app-store";
import { useMatchStore } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { getNation } from "@/tournament/nations";

export type SeenScore = { live: boolean; home: number; away: number };
export type GoalEvent = { matchId: string; side: "home" | "away"; home: number; away: number };

/**
 * Welche Tore sind seit dem letzten Stand gefallen? Nur in Spielen, die
 * vorher und jetzt laufen, nur für eigene Teams (Favorit oder gefolgt) und
 * nie bei verdecktem Spielstand (Spoilerschutz).
 */
export function detectGoals(
  before: Map<string, SeenScore>,
  matches: Pick<MatchView, "id" | "status" | "score" | "home" | "away">[],
  prefs: {
    favorites: string[];
    interesting: string[];
    spoilerProtection: boolean;
    revealed: Record<string, boolean>;
  },
): { seen: Map<string, SeenScore>; goals: GoalEvent[] } {
  const seen = new Map<string, SeenScore>();
  const goals: GoalEvent[] = [];
  for (const m of matches) {
    if (!m.score) continue;
    const now: SeenScore = { live: m.status === "live", home: m.score.home, away: m.score.away };
    seen.set(m.id, now);
    const prev = before.get(m.id);
    if (!prev || !prev.live || !now.live) continue;
    const side = now.home > prev.home ? "home" : now.away > prev.away ? "away" : null;
    if (!side) continue;
    const mine = [m.home, m.away].some(
      (c) => !!c && (prefs.favorites.includes(c) || prefs.interesting.includes(c)),
    );
    if (!mine || (prefs.spoilerProtection && !prefs.revealed[m.id])) continue;
    goals.push({ matchId: m.id, side, home: now.home, away: now.away });
  }
  return { seen, goals };
}

/**
 * „⚽ Tor!“-Hinweis bei Toren in laufenden Spielen deiner Teams – nicht beim
 * Öffnen der App und nicht beim Umschalten der Vorschau (dann gibt es noch
 * keinen „vorherigen“ Stand eines laufenden Spiels).
 */
export function useGoalAlerts(): void {
  useEffect(() => {
    let seen: Map<string, SeenScore> | null = null;
    const check = () => {
      const { matches } = useMatchStore.getState().tournament;
      const app = useAppStore.getState();
      const result = detectGoals(seen ?? new Map(), matches, app);
      // Erster Durchlauf: nur merken.
      if (seen) {
        for (const g of result.goals) {
          const m = matches.find((x) => x.id === g.matchId);
          const home = getNation(m?.home)?.name ?? "Heim";
          const away = getNation(m?.away)?.name ?? "Gast";
          toast(`⚽ Tor für ${g.side === "home" ? home : away}!`, {
            id: `goal-${g.matchId}`,
            description: `${home} ${g.home}:${g.away} ${away}`,
            action: { label: "Ansehen", onClick: () => useUi.getState().openMatch(g.matchId) },
          });
        }
      }
      seen = result.seen;
    };
    check();
    return useMatchStore.subscribe(check);
  }, []);
}
