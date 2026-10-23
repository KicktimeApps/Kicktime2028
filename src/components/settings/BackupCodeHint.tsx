import { Link } from "@tanstack/react-router";
import { KeyRound, X } from "lucide-react";
import { useAppStore } from "@/store/app-store";

/**
 * Einmaliger Hinweis, sobald man in einer Tipprunde ist: Wer die App neu
 * installiert, bekommt eine neue Geräte-ID – die Runden kommen dann nur mit
 * dem Wiederherstellungs-Code zurück. Verschwindet, sobald der Code angesehen
 * wurde oder man ihn wegklickt.
 */
export function BackupCodeHint() {
  const done = useAppStore((s) => s.codeBackupDone);
  const setDone = useAppStore((s) => s.setCodeBackupDone);
  if (done) return null;
  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
      <div className="min-w-0 flex-1 pr-6">
        <div className="text-[15px] font-semibold">Sichere deinen Code</div>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">
          Installierst du KickTime neu oder bekommst ein neues Handy, holst du deine Tipprunden nur
          mit diesem Code zurück.
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
        onClick={() => setDone(true)}
        aria-label="Hinweis schließen"
        className="absolute right-1.5 top-1.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
