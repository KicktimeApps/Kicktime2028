import { useEffect } from "react";
import { logError } from "@/lib/error-log";
import { isBackendConfigured } from "@/services/supabase";
import { saveTips } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useMatchStore } from "@/store/match-store";

/**
 * Gibt die offenen Tipps (vor Anpfiff) und den Europameister-Tipp an den
 * Server – aber nur, wenn das Gerät in einer Tipprunde ist. Allein tippen
 * bleibt komplett lokal.
 */
export async function syncTipsNow(): Promise<void> {
  const { predictions, championTip, demo } = useAppStore.getState();
  if (demo.enabled || !isBackendConfigured()) return;
  const now = Date.now();
  const kickoff = new Map(
    useMatchStore.getState().tournament.matches.map((m) => [m.id, Date.parse(m.kickoffUtc)]),
  );
  const tips = Object.entries(predictions)
    .filter(([id]) => (kickoff.get(id) ?? 0) > now)
    .map(([match_id, p]) => ({ match_id, home: p.home, away: p.away }));
  try {
    await saveTips(tips, championTip);
  } catch (err) {
    logError("supabase", `Tipps teilen: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function useTipSync(): void {
  const inGroups = useAppStore((s) => s.inTipGroups);
  const demo = useAppStore((s) => s.demo.enabled);
  const predictions = useAppStore((s) => s.predictions);
  const champion = useAppStore((s) => s.championTip);
  useEffect(() => {
    if (!inGroups || demo) return;
    // Entprellt: beim schnellen Hoch-/Runtertippen nur einmal senden.
    const t = window.setTimeout(() => void syncTipsNow(), 1500);
    return () => window.clearTimeout(t);
  }, [inGroups, demo, predictions, champion]);
}
