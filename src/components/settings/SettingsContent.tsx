import { BellRing, CalendarPlus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/common/Segmented";
import { WeekEditor } from "@/components/settings/WeekEditor";
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
import { Switch } from "@/components/ui/switch";
import { DEMO_SCENARIOS } from "@/demo/demo";
import { recommend } from "@/domain/recommend";
import { COMMON_TIME_ZONES, detectTimeZone } from "@/domain/time";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { detectPushSupport } from "@/lib/notifications";
import { hasPushBackend, sendTestPush, syncTipReminders } from "@/lib/push";
import { enableReminders } from "@/lib/reminders";
import { ACCENTS, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { Panel } from "./SettingsPanel";

export function TimeContent() {
  const s = useAppStore();
  const prefs = usePrefs();
  return (
    <div className="space-y-4">
      <WeekEditor value={s.availability} onChange={s.setAvailability} timeZone={prefs.timeZone} />
      <Panel>
        <label className="block">
          <span className="text-[15px] font-medium">Zeitzone</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">
            Alle Uhrzeiten in der App werden so angezeigt.
          </span>
          <select
            value={s.timeZoneOverride ?? ""}
            onChange={(e) => s.setTimeZoneOverride(e.target.value || null)}
            className="mt-3 h-12 w-full rounded-xl border border-border bg-subtle px-3 text-[15px] outline-none focus:border-primary"
            aria-label="Zeitzone"
          >
            <option value="">Automatisch ({detectTimeZone().replaceAll("_", " ")})</option>
            {COMMON_TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      </Panel>
    </div>
  );
}

export function RemindersContent() {
  const s = useAppStore();
  const prefs = usePrefs();
  const { matches } = useTournament();
  const support = typeof window !== "undefined" ? detectPushSupport() : "unsupported";
  const myUpcoming = matches.filter((m) => m.status === "scheduled" && recommend(m, prefs).mine);
  return (
    <div className="space-y-4">
      <Panel>
        <label className="flex items-center gap-3">
          <span className="flex-1">
            <span className="block text-[16px] font-medium">Erinnerungen</span>
            <span className="mt-0.5 block text-[13.5px] text-muted-foreground">
              {support === "ios-needs-pwa"
                ? "Auf dem iPhone: erst über Teilen → „Zum Home-Bildschirm“ installieren, dann hier einschalten."
                : hasPushBackend()
                  ? "Mitteilung 15 Minuten vor Anpfiff – auch wenn die App geschlossen ist."
                  : "Mitteilung 15 Minuten vor Anpfiff, solange KickTime geöffnet ist."}
            </span>
          </span>
          <Switch
            checked={s.pushEnabled}
            onCheckedChange={async (v) => {
              if (!v) {
                s.setPushEnabled(false);
                toast("Erinnerungen ausgeschaltet");
              } else {
                await enableReminders();
              }
            }}
            aria-label="Erinnerungen"
          />
        </label>
        <label
          className={cn(
            "mt-4 flex items-center gap-3 border-t border-border/70 pt-4",
            !s.pushEnabled && "opacity-50",
          )}
        >
          <span className="flex-1 text-[15px]">Automatisch für alle Spiele meiner Favoriten</span>
          <Switch
            disabled={!s.pushEnabled}
            checked={s.autoAlarmFavorites}
            onCheckedChange={s.setAutoAlarmFavorites}
            aria-label="Automatisch für Favoriten"
          />
        </label>
        {hasPushBackend() && (
          <label
            className={cn(
              "mt-4 flex items-center gap-3 border-t border-border/70 pt-4",
              !s.pushEnabled && "opacity-50",
            )}
          >
            <span className="flex-1">
              <span className="block text-[15px]">Erinnern, wenn ein Tipp fehlt</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">
                Eine Stunde vor Anpfiff, wenn du in einer Tipprunde noch nicht getippt hast.
              </span>
            </span>
            <Switch
              disabled={!s.pushEnabled}
              checked={s.tipReminders}
              onCheckedChange={async (v) => {
                s.setTipReminders(v);
                if (!(await syncTipReminders(v))) {
                  s.setTipReminders(!v);
                  toast.error("Hat nicht geklappt", {
                    description: "Bitte mit Internet noch einmal versuchen.",
                  });
                }
              }}
              aria-label="Erinnern, wenn ein Tipp fehlt"
            />
          </label>
        )}
        <p className="mt-3 text-[13px] text-muted-foreground">
          Für einzelne Spiele tippst du auf die Glocke am Spiel.
        </p>
        {s.pushEnabled && hasPushBackend() && <TestPushButton />}
      </Panel>
      <Panel>
        <div className="text-[15px] font-medium">Kalender</div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Trägt alle Spiele deiner Teams in den Kalender deines Handys ein – inklusive Erinnerung.
        </p>
        <button
          type="button"
          disabled={myUpcoming.length === 0}
          onClick={() => {
            downloadIcs(myUpcoming, "kicktime-meine-spiele.ics");
            toast.success(`${myUpcoming.length} Spiele exportiert`);
          }}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-[14px] font-medium disabled:opacity-40"
        >
          <CalendarPlus className="h-4 w-4" />
          {myUpcoming.length > 0
            ? `Meine ${myUpcoming.length} Spiele in den Kalender`
            : "Möglich nach der Auslosung"}
        </button>
      </Panel>
    </div>
  );
}

/** Schickt eine echte Push-Nachricht über Server und Apple – zum Prüfen der Einrichtung. */
function TestPushButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const ok = await sendTestPush();
        setBusy(false);
        if (ok) {
          toast.success("Test-Nachricht ist unterwegs", {
            description:
              "Kommt in etwa 1 Minute. Geh solange zum Home-Bildschirm oder sperre das iPhone.",
            duration: 8000,
          });
        } else {
          toast.error("Test hat nicht geklappt", {
            description: "Schalte die Erinnerungen einmal aus und wieder ein.",
          });
        }
      }}
      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 text-[14px] font-semibold text-primary disabled:opacity-50"
    >
      <BellRing className="h-4 w-4" /> {busy ? "Wird gesendet …" : "Test-Benachrichtigung senden"}
    </button>
  );
}

export function AppearanceContent() {
  const s = useAppStore();
  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-3 text-[15px] font-medium">Hell oder dunkel</div>
        <Segmented<ThemeMode>
          size="lg"
          value={s.theme}
          onChange={s.setTheme}
          options={[
            { value: "system", label: "Wie System" },
            { value: "dark", label: "Dunkel" },
            { value: "light", label: "Hell" },
          ]}
        />
      </Panel>
      <Panel>
        <label className="flex items-center gap-3">
          <span className="flex-1">
            <span className="block text-[16px] font-medium">Große Schrift</span>
            <span className="mt-0.5 block text-[13.5px] text-muted-foreground">
              Macht Schrift, Knöpfe und Abstände in der ganzen App etwas größer.
            </span>
          </span>
          <Switch
            checked={s.largeText}
            onCheckedChange={s.setLargeText}
            aria-label="Große Schrift"
          />
        </label>
      </Panel>
      <Panel>
        <div className="mb-3 text-[15px] font-medium">Akzentfarbe</div>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => s.setAccent(a.id)}
              aria-label={a.label}
              aria-pressed={s.accent === a.id}
              title={a.label}
              className={cn(
                "h-11 w-11 rounded-full ring-offset-2 ring-offset-card transition-transform",
                s.accent === a.id && "ring-2 ring-foreground",
              )}
              style={{ background: a.swatch }}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function DemoContent() {
  const demo = useAppStore((s) => s.demo);
  const setDemo = useAppStore((s) => s.setDemo);
  return (
    <div className="space-y-4">
      <Panel>
        <label className="flex items-center gap-3">
          <span className="flex-1 text-[16px] font-medium">Vorschau-Modus</span>
          <Switch
            checked={demo.enabled}
            onCheckedChange={(v) => setDemo(v)}
            aria-label="Vorschau-Modus"
          />
        </label>
      </Panel>
      {demo.enabled && (
        <div className="grid gap-2">
          {DEMO_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setDemo(true, sc.id)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition-colors",
                demo.scenario === sc.id
                  ? "border-gold/60 bg-gold/10"
                  : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <div className="text-[15px] font-semibold">{sc.label}</div>
              <div className="text-[13px] text-muted-foreground">{sc.hint}</div>
            </button>
          ))}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-[15px] font-semibold"
              >
                <RotateCcw className="h-4 w-4" /> Vorschau neu starten
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Vorschau neu starten?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alles in der Vorschau beginnt von vorn: Uhr, deine Vorschau-Tipps und die
                  Europameister-Feier. Deine Tipprunden sind echt und bleiben, wie sie sind.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    useAppStore.getState().restartDemo();
                    // Neu laden: auch alles im Arbeitsspeicher (Tor-Hinweise, Zwischenstände) frisch.
                    window.location.reload();
                  }}
                >
                  Neu starten
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
