import { STAGE_ORDER } from "@/tournament/config";
import type { Stage } from "@/tournament/types";
import { loserOf, winnerOf, type TournamentState } from "./resolve";
import type { MatchView } from "./types";

export type TeamPhase =
  /** Qualifikation läuft noch. */
  | "qualifying"
  /** In der Qualifikation gescheitert. */
  | "missed"
  /** Für die Endrunde qualifiziert / im Turnier und noch dabei. */
  | "alive"
  /** In der Endrunde ausgeschieden. */
  | "out"
  /** Europameister. */
  | "champion";

export type TeamStatus = {
  code: string;
  phase: TeamPhase;
  /** Runde, in der das Team ausgeschieden ist. */
  outIn?: Stage;
  /** Gruppe in der Endrunde. */
  group?: string;
  nextMatch?: MatchView;
};

export const OUT_LABEL: Record<Stage, string> = {
  group: "Aus in der Gruppenphase",
  r16: "Aus im Achtelfinale",
  qf: "Aus im Viertelfinale",
  sf: "Aus im Halbfinale",
  final: "Vize-Europameister",
};

export function tournamentWinner(state: TournamentState): string | null {
  const final = state.matches.find((m) => m.stage === "final");
  return final ? winnerOf(final) : null;
}

export function computeTeamStatuses(
  state: TournamentState,
  codes: string[],
  qualifying: { qualified: string[]; eliminated: string[] },
): Map<string, TeamStatus> {
  const out = new Map<string, TeamStatus>();
  const inTournament = new Map<string, string>(); // code → group
  for (const m of state.matches) {
    if (m.stage !== "group" || !m.group) continue;
    if (m.home) inTournament.set(m.home, m.group);
    if (m.away) inTournament.set(m.away, m.group);
  }
  const drawDone = inTournament.size > 0;

  const eliminated = new Map<string, Stage>();
  // Gruppenphase: Vierte sind raus, Dritte erst nach Abschluss aller Gruppen.
  for (const t of state.tables) {
    if (!t.complete) continue;
    if (t.rows[3]) eliminated.set(t.rows[3].code, "group");
  }
  if (state.groupStageComplete && state.qualifiedThirdGroups) {
    for (const t of state.tables) {
      if (!state.qualifiedThirdGroups.includes(t.group) && t.rows[2]) {
        eliminated.set(t.rows[2].code, "group");
      }
    }
  }
  for (const m of state.matches) {
    if (m.stage === "group") continue;
    const loser = loserOf(m);
    if (loser) eliminated.set(loser, m.stage);
  }
  const champion = tournamentWinner(state);

  for (const code of codes) {
    const group = inTournament.get(code);
    const nextMatch = state.matches.find(
      (m) => m.status !== "finished" && (m.home === code || m.away === code),
    );
    if (code === champion) {
      out.set(code, { code, phase: "champion", group });
    } else if (eliminated.has(code)) {
      out.set(code, { code, phase: "out", outIn: eliminated.get(code), group });
    } else if (group || qualifying.qualified.includes(code)) {
      out.set(code, { code, phase: "alive", group, nextMatch });
    } else if (drawDone || qualifying.eliminated.includes(code)) {
      out.set(code, { code, phase: "missed" });
    } else {
      out.set(code, { code, phase: "qualifying" });
    }
  }
  return out;
}

/** Aktuelle Turnierphase für Kopfzeilen: erste Runde mit offenen Spielen. */
export function currentStage(matches: MatchView[]): Stage | null {
  for (const s of STAGE_ORDER) {
    if (matches.some((m) => m.stage === s && m.status !== "finished")) return s;
  }
  return null;
}
