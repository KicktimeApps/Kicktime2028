import { useEffect, useRef, useState } from "react";
import type { MatchView } from "@/domain/types";

/**
 * true für einen Moment, nachdem in einem laufenden Spiel ein Tor gefallen ist –
 * zum kurzen Aufleuchten. Mit Spoilerschutz (verdeckt) nie.
 */
export function useGoalFlash(m: Pick<MatchView, "status" | "score">, hidden: boolean): boolean {
  const total = m.score ? m.score.home + m.score.away : 0;
  const prev = useRef(total);
  const timer = useRef(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (m.status === "live" && !hidden && total > prev.current) {
      setFlash(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFlash(false), 1800);
    }
    prev.current = total;
  }, [total, m.status, hidden]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return flash;
}
