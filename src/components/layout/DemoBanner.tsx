import { FlaskConical } from "lucide-react";
import { DEMO_SCENARIOS } from "@/demo/demo";
import { useAppStore } from "@/store/app-store";

/** Unübersehbarer Hinweis, solange der Vorschau-Modus aktiv ist. */
export function DemoBanner() {
  const demo = useAppStore((s) => s.demo);
  const setDemo = useAppStore((s) => s.setDemo);
  if (!demo.enabled) return null;
  const meta = DEMO_SCENARIOS.find((s) => s.id === demo.scenario);
  return (
    <div className="flex h-11 items-center gap-2.5 bg-gold px-4 text-[14px] font-semibold text-gold-foreground">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Vorschau · {meta?.label}
        <span className="font-normal opacity-80"> · nur ausgedacht</span>
      </span>
      <button
        type="button"
        onClick={() => setDemo(false)}
        className="h-8 shrink-0 rounded-full bg-black/12 px-3.5 hover:bg-black/20"
      >
        Beenden
      </button>
    </div>
  );
}
