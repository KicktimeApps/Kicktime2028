import { useMemo } from "react";
import { computeTeamStatuses } from "@/domain/status";
import { useTournament } from "@/store/match-store";
import { useAppStore } from "@/store/app-store";
import { ELIMINATED_IN_QUALIFYING, QUALIFIED } from "@/tournament/draw";
import { NATIONS } from "@/tournament/nations";

export function useTeamStatuses() {
  const t = useTournament();
  const demo = useAppStore((s) => s.demo.enabled);
  return useMemo(
    () =>
      computeTeamStatuses(
        t,
        NATIONS.map((n) => n.code),
        demo
          ? { qualified: [], eliminated: [] }
          : { qualified: QUALIFIED, eliminated: ELIMINATED_IN_QUALIFYING },
      ),
    [t, demo],
  );
}
