import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

/** Der Wiederherstellungs-Code groß und gut abschreibbar (8 Vierergruppen). */
export function RecoveryCodeBox({ code }: { code: string }) {
  return (
    <div
      className="grid grid-cols-4 gap-x-2 gap-y-1.5 rounded-xl bg-muted/50 px-3 py-3 text-center font-mono text-[17px] font-semibold tracking-[0.08em] tabular"
      aria-label="Wiederherstellungs-Code"
    >
      {code.split(" ").map((part, i) => (
        <span key={i}>{part}</span>
      ))}
    </div>
  );
}

const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * Sichern: „Teilen“ öffnet das Teilen-Menü des Handys (z. B. Notizen,
 * Passwort-App, an sich selbst schicken), „Kopieren“ legt ihn in die
 * Zwischenablage. `onSaved` meldet, dass der Code gesichert wurde.
 */
export function RecoveryCodeActions({ code, onSaved }: { code: string; onSaved?: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code kopiert");
      onSaved?.();
    } catch {
      toast.error("Kopieren ging nicht – bitte abschreiben.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({
        title: "KickTime – Code für neues Handy",
        text: `Mein KickTime-Code (geheim halten!): ${code}\nNeues Handy: Einstellungen → Handy wechseln.`,
      });
      onSaved?.();
    } catch {
      // abgebrochen – nichts tun
    }
  };
  return (
    <div className="flex gap-2">
      {canShare() && (
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          <Share2 className="h-4 w-4" /> Teilen
        </button>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-semibold"
      >
        <Copy className="h-4 w-4" /> Kopieren
      </button>
    </div>
  );
}
