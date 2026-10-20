import { useQuery } from "@tanstack/react-query";
import { isBackendConfigured } from "@/services/supabase";
import { myBanStatus, type BanStatus } from "@/services/tipgroups";

export const BAN_STATUS_KEY = ["ban-status"] as const;

/** Eigene Sperre „überall“ und Stand der eigenen Entsperrungsanträge. */
export function useBanStatus() {
  return useQuery({
    queryKey: BAN_STATUS_KEY,
    enabled: isBackendConfigured(),
    staleTime: 20_000,
    // Beim Zurückkehren in die App nachsehen (z. B. Antrag inzwischen angenommen).
    refetchOnWindowFocus: true,
    // Solange etwas offen ist, ab und zu nachsehen, ob entschieden wurde.
    refetchInterval: (q) =>
      q.state.data?.global || q.state.data?.requests.some((r) => r.status === "open")
        ? 60_000
        : false,
    // Ohne Server-Update gibt es die Funktion nicht – dann einfach „nichts gesperrt“.
    retry: false,
    queryFn: async (): Promise<BanStatus> =>
      myBanStatus().catch(() => ({ global: false, requests: [] })),
  });
}
