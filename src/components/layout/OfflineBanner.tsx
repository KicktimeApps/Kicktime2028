import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useMatchStore } from "@/store/match-store";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Hinweis im Funkloch: was angezeigt wird, ist der zuletzt geladene Stand. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const at = useMatchStore((s) => s.live.lastFetchAt);
  const demo = useMatchStore((s) => s.demo.enabled);
  if (online || demo) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-[14px]"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="font-semibold">Kein Internet.</span>{" "}
        <span className="text-muted-foreground">
          {at
            ? `Du siehst den Stand von ${new Date(at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`
            : "Spielplan und Zeiten funktionieren trotzdem."}
        </span>
      </span>
    </div>
  );
}
