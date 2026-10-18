import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function SpoilerToggle({
  withLabel = false,
  className,
}: {
  withLabel?: boolean;
  className?: string;
}) {
  const on = useAppStore((s) => s.spoilerProtection);
  const set = useAppStore((s) => s.setSpoiler);
  return (
    <button
      type="button"
      onClick={() => {
        set(!on);
        toast(
          on
            ? "Spoilerschutz aus – Ergebnisse sichtbar"
            : "Spoilerschutz an – Ergebnisse verborgen",
        );
      }}
      aria-pressed={on}
      aria-label={on ? "Spoilerschutz ausschalten" : "Spoilerschutz einschalten"}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
        !withLabel && "w-11 justify-center px-0",
        className,
      )}
    >
      {on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {withLabel && <span>{on ? "Spoilerschutz an" : "Spoilerschutz aus"}</span>}
    </button>
  );
}
