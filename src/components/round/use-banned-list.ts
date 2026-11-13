import { useQuery } from "@tanstack/react-query";
import { bannedMembers } from "@/services/tipgroups";

/** Gesperrte einer Runde – geteilt von Liste und Zähler am Zahnrad. */
export function useBannedList(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tip-banned", groupId],
    queryFn: () => bannedMembers(groupId),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    // Fehlt das Server-Update, einfach nichts anzeigen.
    retry: false,
  });
}
