import { useQuery } from "@tanstack/react-query";
import { isBackendConfigured } from "@/services/supabase";
import { myGroups, TipError, type TipGroup } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";

export const TIP_GROUPS_KEY = ["tip-groups"] as const;

/** Eigene Tipprunden – hält nebenbei fest, ob Tipps geteilt werden müssen. */
export function useMyGroups() {
  const demo = useAppStore((s) => s.demo.enabled);
  const setTipGroups = useAppStore((s) => s.setTipGroups);
  return useQuery({
    queryKey: TIP_GROUPS_KEY,
    enabled: isBackendConfigured() && !demo,
    staleTime: 30_000,
    // Fehlt die Funktion auf dem Server (SQL-Update nicht ausgeführt), nicht
    // ständig nachfragen.
    retry: (count, err) => !(err instanceof TipError && err.notInstalled) && count < 2,
    queryFn: async (): Promise<TipGroup[]> => {
      const list = await myGroups();
      setTipGroups(list.map(({ id, code, name }) => ({ id, code, name })));
      return list;
    },
  });
}
