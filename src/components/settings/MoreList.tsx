import { ChevronRight, ExternalLink, Info, ShieldCheck, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { hasPushBackend, syncServerAlarms, unsubscribePush } from "@/lib/push";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { isBackendConfigured } from "@/services/supabase";
import { forgetDevice, TipError } from "@/services/tipgroups";
import { LEGAL_URL, TOURNAMENT } from "@/tournament/config";

/** Abschluss der Übersicht: Rechtliches, Neustart, Löschen und Versionszeile. */
export function MoreList({ onRestart }: { onRestart: () => void }) {
  const row =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] transition-colors hover:bg-muted/40";
  return (
    <div>
      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        <a
          href={`${LEGAL_URL}/datenschutz`}
          target="_blank"
          rel="noopener noreferrer"
          className={row}
        >
          <ShieldCheck className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="flex-1">Datenschutz</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground/60" />
        </a>
        <a
          href={`${LEGAL_URL}/impressum`}
          target="_blank"
          rel="noopener noreferrer"
          className={row}
        >
          <Info className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="flex-1">Impressum</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground/60" />
        </a>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className={row}>
              <RotateCcw className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="flex-1">Einrichtung neu starten</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Einrichtung neu starten?</AlertDialogTitle>
              <AlertDialogDescription>
                Du wählst Teams und Zeiten noch einmal aus. Deine Tipps bleiben erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={onRestart}>Neu starten</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className={cn(row, "text-destructive")}>
              <Trash2 className="h-[18px] w-[18px]" />
              <span className="flex-1">Alle Daten löschen</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wirklich alles löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Teams, Zeitfenster, Tipps und Erinnerungen werden von diesem Gerät entfernt. Aus
                deinen Tipprunden trittst du aus – Runden, die du leitest, übernimmt das älteste
                Mitglied. Das lässt sich nicht rückgängig machen. Nur das Handy wechseln? Dann nimm
                lieber „Handy wechseln“.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  // Erst den Server aufräumen, solange die Geräte-ID noch da ist –
                  // sonst bliebe das Gerät Mitglied seiner Runden und bekäme weiter
                  // Mitteilungen, die es nicht mehr abbestellen kann.
                  if (hasPushBackend()) await syncServerAlarms([]).catch(() => {});
                  if (isBackendConfigured()) {
                    try {
                      await forgetDevice();
                    } catch (err) {
                      if (!(err instanceof TipError && err.notInstalled)) {
                        toast.error(
                          "Ohne Verbindung zum KickTime-Server kann ich dich nicht aus deinen Tipprunden austragen. Bitte mit Internet noch einmal versuchen.",
                        );
                        return;
                      }
                    }
                  }
                  await unsubscribePush().catch(() => {});
                  try {
                    Object.keys(localStorage)
                      .filter((k) => k.startsWith(TOURNAMENT.storagePrefix))
                      .forEach((k) => localStorage.removeItem(k));
                  } catch {
                    /* noop */
                  }
                  window.location.assign("/");
                }}
              >
                Ja, löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Der frühere versteckte Team-Bereich (5× tippen) ist seit 2.18.0 die eigene
          Team-App (KicktimeApps/Kicktime2028-Admin). */}
      <p className="mx-auto mt-5 w-fit px-4 text-center text-[12px] leading-relaxed text-muted-foreground">
        KickTime {TOURNAMENT.year} · Version {APP_VERSION} · PhanDev Studios
        <br />
        Privates Fan-Projekt ohne Verbindung zur UEFA
      </p>
    </div>
  );
}
