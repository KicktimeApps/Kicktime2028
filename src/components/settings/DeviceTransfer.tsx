import { Copy, Eye, KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  FormSheet,
  FormSheetContent,
  FormSheetDescription,
  FormSheetTitle,
} from "@/components/common/FormSheet";
import { adoptDeviceId, formatRecoveryCode, getDeviceId, parseRecoveryCode } from "@/lib/device-id";
import { hasPushBackend, syncServerAlarms } from "@/lib/push";
import { cn } from "@/lib/utils";
import { groupsOfDevice, TipError, type TipGroup } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";

/**
 * Handywechsel ohne Konto: Der Wiederherstellungs-Code ist die Geräte-ID.
 * Gibt man ihn auf dem neuen Handy ein, übernimmt es diese ID – und damit
 * Tipprunden, Tipps und Mitteilungen (alles hängt auf dem Server an der ID).
 * Teams, Zeiten und Einstellungen bleiben auf dem alten Gerät.
 */
export function DeviceTransfer() {
  return (
    <div className="space-y-4">
      <ShowCode />
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-[16px] font-semibold">Neues Handy?</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Gib hier den Code deines alten Handys ein.
        </p>
        <RestoreForm className="mt-3" />
      </section>
    </div>
  );
}

function ShowCode() {
  const [code, setCode] = useState<string | null>(null);
  const setBackupDone = useAppStore((s) => s.setCodeBackupDone);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-[16px] font-semibold">Dein Code</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">
        Damit holst du deine Tipprunden und Tipps auf ein neues Handy. Dort unter Einstellungen →
        Handy wechseln eingeben (oder gleich beim Einrichten).
      </p>
      {code ? (
        <>
          <div
            className="mt-4 grid grid-cols-4 gap-x-2 gap-y-1.5 rounded-xl bg-muted/50 px-3 py-3 text-center font-mono text-[17px] font-semibold tracking-[0.08em] tabular"
            aria-label="Wiederherstellungs-Code"
          >
            {code.split(" ").map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                toast.success("Code kopiert");
              } catch {
                toast.error("Kopieren ging nicht – bitte abschreiben.");
              }
            }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-[15px] font-semibold"
          >
            <Copy className="h-4 w-4" /> Kopieren
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCode(formatRecoveryCode(getDeviceId()));
            // Hinweis „Sichere deinen Code“ hat sich damit erledigt.
            setBackupDone(true);
          }}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          <Eye className="h-4 w-4" /> Code anzeigen
        </button>
      )}
      <p className="mt-3 flex gap-2 text-[13px] text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <span>
          Geheim halten: Wer den Code hat, kann in deinem Namen tippen. Das KickTime-Team fragt nie
          danach.
        </span>
      </p>
    </section>
  );
}

/** Eingabe auf dem neuen Handy: Code prüfen, zeigen was übernommen wird, übernehmen. */
function RestoreForm({ className }: { className?: string }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ id: string; groups: TipGroup[] } | null>(null);
  const ownGroups = useAppStore((s) => s.tipGroups.length);
  const id = parseRecoveryCode(input);
  const typed = input.replace(/[^0-9a-fA-F]/g, "").length;

  const check = async () => {
    if (!id || busy) return;
    setError(null);
    if (id === getDeviceId()) {
      setError("Das ist der Code dieses Handys. Gib den Code deines alten Handys ein.");
      return;
    }
    setBusy(true);
    try {
      const groups = await groupsOfDevice(id);
      if (groups.length === 0) {
        setError("Zu diesem Code gibt es keine Tipprunden. Bitte den Code noch einmal prüfen.");
      } else {
        setFound({ id, groups });
      }
    } catch (err) {
      setError(
        err instanceof TipError ? err.message : "Das hat nicht geklappt. Bitte später noch einmal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const adopt = async () => {
    if (!found || busy) return;
    setBusy(true);
    // Erinnerungen der bisherigen ID stoppen – sonst kämen sie weiter.
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (granted && hasPushBackend()) await syncServerAlarms([]).catch(() => {});
    // Zwischenspeicher der bisherigen Runden leeren; nach dem Neuladen kommt
    // alles vom Server. seenGroups leer → kein falscher „Entfernt“-Hinweis.
    useAppStore.setState({
      tipGroups: [],
      inTipGroups: false,
      groupTips: {},
      groupChampion: {},
      seenGroups: [],
      groupNotice: null,
      tipContext: null,
      // Wer den Code eingibt, hat ihn schon – kein Hinweis „Code sichern“.
      codeBackupDone: true,
    });
    adoptDeviceId(found.id);
    window.location.assign("/tipps");
  };

  if (found) {
    return (
      <div className={className}>
        <p className="text-[14px] font-semibold">
          Gefunden:{" "}
          {found.groups.length === 1 ? "1 Tipprunde" : `${found.groups.length} Tipprunden`}
        </p>
        <ul className="mt-2 divide-y divide-border/70 rounded-xl border border-border">
          {found.groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 px-3 py-2.5 text-[15px]">
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {g.pending && (
                <span className="shrink-0 text-[12.5px] text-muted-foreground">Anfrage offen</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Übernommen werden Tipprunden, Tipps und Mitteilungen. Teams, Zeiten und Einstellungen
          wählst du hier neu. Nutze danach nur noch dieses Handy – Mitteilungen kommen nur auf einem
          Gerät an.
          {ownGroups > 0 &&
            ` Achtung: ${ownGroups === 1 ? "Die Tipprunde" : `Die ${ownGroups} Tipprunden`} dieses Handys ${ownGroups === 1 ? "geht" : "gehen"} dabei verloren.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFound(null)}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-border text-[15px] font-semibold"
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={() => void adopt()}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            Übernehmen
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        void check();
      }}
    >
      <label className="block">
        <span className="sr-only">Wiederherstellungs-Code</span>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          rows={2}
          placeholder="z. B. 3F2A 91C0 7B4E …"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="block w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-[16px] uppercase tracking-[0.06em] outline-none placeholder:normal-case placeholder:tracking-normal focus:border-primary"
        />
      </label>
      <div className="mt-1 flex justify-between text-[12.5px] text-muted-foreground">
        <span>{error ? "" : "32 Zeichen, nur 0–9 und A–F"}</span>
        <span className={cn("tabular", typed > 32 && "text-destructive")}>{typed}/32</span>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[13.5px] text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!id || busy}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        <KeyRound className="h-4 w-4" /> {busy ? "Prüfe …" : "Code prüfen"}
      </button>
    </form>
  );
}

/** Für die Einführung: Code des alten Handys gleich am Anfang eingeben. */
export function RestoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormSheet open={open} onOpenChange={onOpenChange}>
      <FormSheetContent>
        <FormSheetTitle className="pr-10 font-display text-2xl font-bold uppercase">
          Handy wechseln
        </FormSheetTitle>
        <FormSheetDescription className="mt-1 text-[14px] text-muted-foreground">
          Den Code findest du auf dem alten Handy unter Einstellungen → Handy wechseln.
        </FormSheetDescription>
        <RestoreForm className="mt-4" />
      </FormSheetContent>
    </FormSheet>
  );
}
