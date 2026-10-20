import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useMatchStore } from "@/store/match-store";
import { cn } from "@/lib/utils";
import { useAnnouncement, visibleAnnouncement } from "@/services/announcement";

const ICON = { info: Info, warn: CircleAlert, success: CircleCheck };

/** Hinweis vom Betreiber an alle (im Admin-Bereich unter „Mitteilungen“). */
export function AnnouncementBanner() {
  const current = useAnnouncement((s) => s.current);
  const dismissed = useAnnouncement((s) => s.dismissed);
  const dismiss = useAnnouncement((s) => s.dismiss);
  // Echte Uhrzeit, nicht die Vorschau-Zeit
  const now = useMatchStore((s) => Math.floor(s.now / 60_000) * 60_000);
  const a = visibleAnnouncement(current, dismissed, now);
  if (!a) return null;
  const Icon = ICON[a.tone] ?? Info;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[14px]",
        a.tone === "warn" && "border-gold/50 bg-gold/10",
        a.tone === "success" && "border-primary/40 bg-primary/10",
        a.tone === "info" && "border-border bg-card",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          a.tone === "warn"
            ? "text-gold"
            : a.tone === "success"
              ? "text-primary"
              : "text-muted-foreground",
        )}
      />
      <p className="flex-1 whitespace-pre-line">{a.text}</p>
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
