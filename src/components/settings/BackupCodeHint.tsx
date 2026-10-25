import { Link } from "@tanstack/react-router";
import { KeyRound, X } from "lucide-react";
import { backupHint } from "@/lib/backup-hint";
import { useAppStore } from "@/store/app-store";
import { TOURNAMENT } from "@/tournament/config";

/**
 * Hinweis, sobald man in einer Tipprunde ist: Wer die App neu installiert,
 * bekommt eine neue Geräte-ID – die Runden kommen dann nur mit dem
 * Wiederherstellungs-Code zurück. Erst einmalig; wer ihn nur weggeklickt und den
 * Code nie angesehen hat, wird kurz vor dem Turnier noch einmal erinnert
 * (`lib/backup-hint.ts`). Echte Uhrzeit, nicht die des Vorschau-Modus.
 */
export function BackupCodeHint() {
  const done = useAppStore((s) => s.codeBackupDone);
  const seen = useAppStore((s) => s.codeBackupSeen);
  const reminded = useAppStore((s) => s.codeBackupReminded);
  const setDone = useAppStore((s) => s.setCodeBackupDone);
  const setReminded = useAppStore((s) => s.setCodeBackupReminded);
  const kind = backupHint({ done, seen, reminded }, Date.now(), TOURNAMENT);
  if (!kind) return null;
  const reminder = kind === "reminder";
  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
      <div className="min-w-0 flex-1 pr-6">
        <div className="text-[15px] font-semibold">
          {reminder ? "Bald geht's los – Code gesichert?" : "Sichere deinen Code"}
        </div>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">
          {reminder
            ? "Geht dein Handy während der EM kaputt oder installierst du KickTime neu, kommen deine Tipprunden nur mit diesem Code zurück."
            : "Installierst du KickTime neu oder bekommst ein neues Handy, holst du deine Tipprunden nur mit diesem Code zurück."}
        </p>
        <Link
          to="/einstellungen"
          search={{ s: "handywechsel" }}
          className="mt-2 inline-flex h-10 items-center rounded-full bg-gold px-4 text-[14px] font-semibold text-gold-foreground"
        >
          Code sichern
        </Link>
      </div>
      <button
        type="button"
        onClick={() => (reminder ? setReminded() : setDone(true))}
        aria-label="Hinweis schließen"
        className="absolute right-1.5 top-1.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
