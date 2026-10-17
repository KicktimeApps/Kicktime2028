import { useAppStore } from "@/store/app-store";
import type { MatchView } from "@/domain/types";

/**
 * Spoilerschutz: Spielstände (laufend und beendet) bleiben verborgen, bis der
 * Nutzer sie pro Spiel aufdeckt – oder den Schutz global abschaltet.
 */
export function useSpoiler(m: Pick<MatchView, "id" | "status" | "score">) {
  const protect = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => !!s.revealed[m.id]);
  const reveal = useAppStore((s) => s.reveal);
  const hasScore = !!m.score && m.status !== "scheduled";
  return { hidden: hasScore && protect && !revealed, reveal: () => reveal(m.id) };
}
