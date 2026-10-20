import { useQuery } from "@tanstack/react-query";
import { isBackendConfigured } from "@/services/supabase";
import {
  myBanStatus,
  myBans,
  myGroups,
  TipError,
  wasLeftByMe,
  type TipGroup,
} from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";

export const TIP_GROUPS_KEY = ["tip-groups"] as const;

/** Eigene Tipprunden – hält nebenbei fest, ob Tipps geteilt werden müssen. */
export function useMyGroups() {
  const setTipGroups = useAppStore((s) => s.setTipGroups);
  return useQuery({
    queryKey: TIP_GROUPS_KEY,
    // Auch im Vorschau-Modus: Tipprunden sind dort echt (nur die Ergebnisse
    // sind simuliert), damit man echte Leute einladen kann.
    enabled: isBackendConfigured(),
    staleTime: 5_000,
    // Solange eine Anfrage offen ist, regelmäßig nachsehen, ob angenommen wurde.
    // Bei offener Anfrage oft (angenommen?), sonst regelmäßig (neue Anfragen).
    refetchInterval: (q) =>
      !q.state.data?.length ? false : q.state.data.some((g) => g.pending) ? 5_000 : 20_000,
    // Fehlt die Funktion auf dem Server (SQL-Update nicht ausgeführt), nicht
    // ständig nachfragen.
    retry: (count, err) => !(err instanceof TipError && err.notInstalled) && count < 2,
    queryFn: async (): Promise<TipGroup[]> => {
      const list = await myGroups();
      // Runde verschwunden, ohne dass man selbst gegangen ist → rausgeworfen,
      // Runde gelöscht oder Anfrage abgelehnt. Einmal Bescheid geben.
      const store = useAppStore.getState();
      const gone = store.seenGroups.find(
        (g) => !list.some((x) => x.id === g.id) && !wasLeftByMe(g.id),
      );
      if (gone) {
        // Gesperrt? Dann deutlich anders als „entfernt“. Überall gesperrt kann
        // auch heißen, dass die eigene Runde dabei aufgelöst wurde.
        let ban = gone.pending ? undefined : (await myBans()).find((b) => b.id === gone.id);
        if (!ban && !gone.pending && (await myBanStatus().catch(() => null))?.global)
          ban = { id: gone.id, name: gone.name, by: "global" };
        store.setGroupNotice({
          id: gone.id,
          name: gone.name,
          reason: ban ? "banned" : gone.pending ? "rejected" : "removed",
          by: ban?.by,
        });
      }
      store.setSeenGroups(list.map((g) => ({ id: g.id, name: g.name, pending: !!g.pending })));
      // Getippt wird nur in Runden, in denen man angenommen ist.
      setTipGroups(
        list.filter((g) => !g.pending).map(({ id, code, name }) => ({ id, code, name })),
      );
      return list;
    },
  });
}
