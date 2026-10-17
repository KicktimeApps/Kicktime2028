import { FlaskConical, X } from "lucide-react";
import { DEMO_SCENARIOS } from "@/demo/demo";
import { useAppStore } from "@/store/app-store";

/** Unübersehbarer Hinweis, solange der Vorschau-Modus aktiv ist. */
export function DemoBanner() {
  const demo = useAppStore((s) => s.demo);
  const setDemo = useAppStore((s) => s.setDemo);
  if (!demo.enabled) return null;
  const meta = DEMO_SCENARIOS.find((s) => s.id === demo.scenario);
  return (
    <div className="flex items-center gap-2 bg-gold px-4 py-1.5 text-[12px] font-semibold text-gold-foreground">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Vorschau-Modus: {meta?.label} · erfundene Auslosung & Ergebnisse
      </span>
      <button
        type="button"
        onClick={() => setDemo(false)}
        className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 hover:bg-black/20"
      >
        <X className="h-3 w-3" /> Beenden
      </button>
    </div>
  );
}
