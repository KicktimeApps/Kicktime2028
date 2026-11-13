import { useQuery } from "@tanstack/react-query";
import { Info, X } from "lucide-react";
import { useState } from "react";
import { groupEvents } from "@/services/tipgroups";

const SEEN_EVENTS_KEY = "kicktime-2028.seen-group-events";

/**
 * Hinweise der Runde für alle Mitglieder, z. B. „Tim wurde vom KickTime-Team
 * gesperrt“ oder „Anna leitet die Runde jetzt“. Weggeklickt bleibt weg.
 */
export function GroupEvents({ groupId }: { groupId: string }) {
  const { data } = useQuery({
    queryKey: ["tip-events", groupId],
    queryFn: () => groupEvents(groupId),
    refetchInterval: 60_000,
    retry: false,
  });
  const [seen, setSeen] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_EVENTS_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const fresh = (data ?? []).filter((e) => !seen.includes(e.id)).slice(0, 3);
  if (fresh.length === 0) return null;
  const dismiss = () => {
    const next = [...seen, ...fresh.map((e) => e.id)].slice(-200);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_EVENTS_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  };
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-[14px]"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <ul className="flex-1 space-y-0.5">
        {fresh.map((e) => (
          <li key={e.id}>{e.text}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hinweis schließen"
        className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
