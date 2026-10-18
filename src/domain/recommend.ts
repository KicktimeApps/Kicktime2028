import { STAGE_WEIGHT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";
import { fitFor, type Fit, type WeekAvailability } from "./time";
import type { MatchView } from "./types";

export type Prefs = {
  favorites: string[];
  interesting: string[];
  /** Einzelne Spiele, die der Nutzer vorgemerkt hat (Match-IDs). */
  pinned: string[];
  availability: WeekAvailability;
  timeZone: string;
};

export type Reason =
  | "favorite"
  | "interesting"
  | "pinned"
  | "topDuel"
  | "knockout"
  | "opener"
  | "final";

export type Recommendation = {
  match: MatchView;
  fit: Fit;
  /** 0..100 – wie sehr lohnt sich das Spiel für diesen Nutzer? */
  score: number;
  reasons: Reason[];
  /** Spiel betrifft eigene Teams oder ist vorgemerkt. */
  mine: boolean;
};

export const REASON_LABEL: Record<Reason, string> = {
  favorite: "Dein Favorit",
  interesting: "Dein Team",
  pinned: "Vorgemerkt",
  topDuel: "Top-Duell",
  knockout: "K.-o.-Spiel",
  opener: "Eröffnungsspiel",
  final: "Finale",
};

const involves = (m: MatchView, codes: string[]) =>
  (!!m.home && codes.includes(m.home)) || (!!m.away && codes.includes(m.away));

export function recommend(m: MatchView, p: Prefs): Recommendation {
  const reasons: Reason[] = [];
  let score = 0;
  if (involves(m, p.favorites)) {
    reasons.push("favorite");
    score += 60;
  } else if (involves(m, p.interesting)) {
    reasons.push("interesting");
    score += 35;
  }
  if (p.pinned.includes(m.id)) {
    reasons.push("pinned");
    score += 30;
  }
  const tierA = getNation(m.home)?.tier;
  const tierB = getNation(m.away)?.tier;
  if (tierA === 1 && tierB === 1) {
    reasons.push("topDuel");
    score += 25;
  } else if (tierA && tierB && tierA + tierB <= 3) {
    score += 10;
  }
  if (m.number === 1) {
    reasons.push("opener");
    score += 20;
  }
  if (m.stage === "final") reasons.push("final");
  else if (m.stage !== "group") reasons.push("knockout");
  score += STAGE_WEIGHT[m.stage];

  const fit = fitFor(m.kickoffUtc, p.timeZone, p.availability);
  if (fit === "full") score += 10;
  else if (fit === "partial") score += 4;

  return {
    match: m,
    fit,
    score: Math.min(100, score),
    reasons,
    mine:
      reasons.includes("favorite") || reasons.includes("interesting") || reasons.includes("pinned"),
  };
}

export type Feed = {
  /** Eigene Spiele, die ins Zeitfenster passen. */
  perfect: Recommendation[];
  /** Eigene Spiele außerhalb des Zeitfensters → Erinnerung/Aufnahme. */
  outside: Recommendation[];
  /** Keine eigenen Teams, aber sehenswert und zeitlich passend. */
  bonus: Recommendation[];
  /** Beendete eigene Spiele, neueste zuerst. */
  recap: Recommendation[];
};

const BONUS_MIN_SCORE = 30;

export function buildFeed(
  matches: MatchView[],
  p: Prefs,
  opts: { bonusLimit?: number } = {},
): Feed {
  const feed: Feed = { perfect: [], outside: [], bonus: [], recap: [] };
  for (const m of matches) {
    const r = recommend(m, p);
    if (m.status === "finished") {
      if (r.mine) feed.recap.push(r);
      continue;
    }
    if (r.mine) {
      (r.fit === "none" ? feed.outside : feed.perfect).push(r);
    } else if (r.fit !== "none" && r.score >= BONUS_MIN_SCORE) {
      feed.bonus.push(r);
    }
  }
  const byTime = (a: Recommendation, b: Recommendation) =>
    Date.parse(a.match.kickoffUtc) - Date.parse(b.match.kickoffUtc);
  feed.perfect.sort(byTime);
  feed.outside.sort(byTime);
  feed.bonus.sort(byTime);
  feed.bonus = feed.bonus.slice(0, opts.bonusLimit ?? 8);
  feed.recap.sort((a, b) => -byTime(a, b));
  return feed;
}

/**
 * Nächstes noch nicht begonnenes Spiel mit eigenem Team (oder vorgemerkt),
 * unabhängig vom Zeitfenster. Laufende Spiele zeigt „Jetzt live“.
 */
export function nextOwnMatch(matches: MatchView[], p: Prefs): MatchView | null {
  return matches.find((m) => m.status === "scheduled" && recommend(m, p).mine) ?? null;
}
