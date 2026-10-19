import { useMemo } from "react";
import type { Prediction } from "@/domain/predictions";
import { clearTip, setGroupChampion, setTip } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";

/**
 * Wofür gerade getippt wird:
 *  - „solo“: allein, nur auf dem Gerät – nur solange man in keiner Runde ist
 *  - eine Tipprunde: eigene Tipps je Runde, gespeichert auf dem Server
 *  - Vorschau-Runde: wie eine Tipprunde, aber nur auf dem Gerät
 */
export type TipContext =
  | { kind: "solo"; id: "solo"; label: string }
  | { kind: "group"; id: string; label: string }
  | { kind: "demo"; id: string; label: string };

type StoreState = ReturnType<typeof useAppStore.getState>;

export function contextsOf(s: StoreState): TipContext[] {
  if (s.demo.enabled) {
    if (s.demoGroups.length > 0)
      return s.demoGroups.map((g) => ({ kind: "demo" as const, id: g.id, label: g.name }));
    return [{ kind: "solo", id: "solo", label: "Allein" }];
  }
  if (s.tipGroups.length > 0)
    return s.tipGroups.map((g) => ({ kind: "group" as const, id: g.id, label: g.name }));
  return [{ kind: "solo", id: "solo", label: "Allein" }];
}

export function currentContextOf(s: StoreState): TipContext {
  const list = contextsOf(s);
  return list.find((c) => c.id === s.tipContext) ?? list[0];
}

export function tipsOf(s: StoreState, ctx: TipContext): Record<string, Prediction> {
  if (ctx.kind !== "solo") return s.groupTips[ctx.id] ?? EMPTY;
  return s.demo.enabled ? s.demoPredictions : s.predictions;
}

export function championOf(s: StoreState, ctx: TipContext): string | null {
  if (ctx.kind !== "solo") return s.groupChampion[ctx.id] ?? null;
  return s.demo.enabled ? s.demoChampionTip : s.championTip;
}

const EMPTY: Record<string, Prediction> = {};

/** Aktueller Kontext als Hook (stabil, solange sich die Auswahl nicht ändert). */
export function useTipContext(): TipContext {
  const key = useAppStore((s) => JSON.stringify(currentContextOf(s)));
  return useMemo(() => JSON.parse(key) as TipContext, [key]);
}

export function useTipContexts(): TipContext[] {
  const key = useAppStore((s) => JSON.stringify(contextsOf(s)));
  return useMemo(() => JSON.parse(key) as TipContext[], [key]);
}

export function useContextTips(ctx: TipContext): Record<string, Prediction> {
  return useAppStore((s) => tipsOf(s, ctx));
}

export function useContextChampion(ctx: TipContext): string | null {
  return useAppStore((s) => championOf(s, ctx));
}

/* ------------------------------------------------------------------ */
/* Speichern                                                           */
/* ------------------------------------------------------------------ */

/** Tipp speichern bzw. löschen (tip = null). Wirft bei Fehlern (z. B. Anpfiff vorbei). */
export async function saveTip(
  ctx: TipContext,
  matchId: string,
  tip: { home: number; away: number } | null,
): Promise<void> {
  const store = useAppStore.getState();
  if (ctx.kind === "group") {
    if (tip) await setTip(ctx.id, matchId, tip.home, tip.away);
    else await clearTip(ctx.id, matchId);
    store.setGroupTip(ctx.id, matchId, tip);
    return;
  }
  if (ctx.kind === "demo") {
    store.setGroupTip(ctx.id, matchId, tip);
    return;
  }
  // allein: nur auf dem Gerät (setPrediction wählt selbst Vorschau oder echt)
  if (tip) store.setPrediction(matchId, tip.home, tip.away);
  else store.clearPrediction(matchId);
}

export async function saveChampion(ctx: TipContext, code: string | null): Promise<void> {
  const store = useAppStore.getState();
  if (ctx.kind === "group") {
    await setGroupChampion(ctx.id, code);
    store.setGroupChampion(ctx.id, code);
    return;
  }
  if (ctx.kind === "demo") {
    store.setGroupChampion(ctx.id, code);
    return;
  }
  store.setChampionTip(code);
}
