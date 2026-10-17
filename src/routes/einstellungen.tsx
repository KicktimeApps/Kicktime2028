import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  CalendarPlus,
  Clock3,
  ExternalLink,
  EyeOff,
  FlaskConical,
  Globe,
  MessageSquareHeart,
  Palette,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Segmented } from "@/components/common/Segmented";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { WeekEditor } from "@/components/settings/WeekEditor";
import { Flag } from "@/components/team/Flag";
import { TeamPicker } from "@/components/team/TeamPicker";
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
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { DEMO_SCENARIOS } from "@/demo/demo";
import { recommend } from "@/domain/recommend";
import { COMMON_TIME_ZONES, detectTimeZone } from "@/domain/time";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { submitFeedback, type FeedbackRating } from "@/lib/feedback";
import { haptics } from "@/lib/haptics";
import { detectPushSupport } from "@/lib/notifications";
import { hasPushBackend } from "@/lib/push";
import { enableReminders } from "@/lib/reminders";
import { ACCENTS, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { isBackendConfigured } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { LEGAL_URL, TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";

export const Route = createFileRoute("/einstellungen")({
  head: () => ({
    meta: [{ title: "Einstellungen | KickTime" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function Card({
  icon,
  title,
  text,
  children,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  text?: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid rounded-2xl border border-border bg-card p-4 md:mb-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {text && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
          )}
        </div>
        {aside}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

function SettingsPage() {
  const s = useAppStore();
  const prefs = usePrefs();
  const { matches } = useTournament();
  const [teamsOpen, setTeamsOpen] = useState(false);
  const support = typeof window !== "undefined" ? detectPushSupport() : "unsupported";
  const myTeams = [...s.favorites, ...s.interesting];
  const myUpcoming = matches.filter((m) => m.status === "scheduled" && recommend(m, prefs).mine);

  return (
    <div>
      <PageHeader
        eyebrow="Profil"
        title="Einstellungen"
        subtitle="Alles wird nur auf diesem Gerät gespeichert."
      />

      <div className="space-y-4 md:columns-2 md:gap-4 md:space-y-0">
        <Card
          icon={<Star />}
          title="Deine Teams"
          text="Favoriten stehen ganz oben und bekommen automatisch Erinnerungen."
          aside={
            <button
              type="button"
              onClick={() => setTeamsOpen(true)}
              className="text-[13px] font-semibold text-primary"
            >
              Bearbeiten
            </button>
          }
        >
          {myTeams.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Noch keine Teams gewählt.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {myTeams.map((c) => {
                const n = getNation(c);
                if (!n) return null;
                return (
                  <span
                    key={c}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle py-1 pl-1.5 pr-3 text-[13px] font-medium"
                  >
                    <Flag flag={n.flag} size="sm" className="rounded-full" />
                    {n.name}
                    {s.favorites.includes(c) && <Star className="h-3 w-3 fill-gold text-gold" />}
                  </span>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          icon={<Clock3 />}
          title="Deine Zeit"
          text="Wann kannst du in der Regel Fußball schauen?"
        >
          <WeekEditor
            value={s.availability}
            onChange={s.setAvailability}
            timeZone={prefs.timeZone}
          />
        </Card>

        <Card
          icon={<Globe />}
          title="Zeitzone"
          text="Alle Anstoßzeiten werden in dieser Zeitzone angezeigt."
        >
          <select
            value={s.timeZoneOverride ?? ""}
            onChange={(e) => s.setTimeZoneOverride(e.target.value || null)}
            className="h-11 w-full rounded-xl border border-border bg-subtle px-3 text-[14px] outline-none focus:border-primary"
            aria-label="Zeitzone"
          >
            <option value="">Automatisch ({detectTimeZone().replace("_", " ")})</option>
            {COMMON_TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </Card>

        <Card
          icon={<EyeOff />}
          title="Spoilerschutz"
          text="Spielstände und Tabellen bleiben verborgen, bis du sie aufdeckst."
          aside={
            <Switch
              checked={s.spoilerProtection}
              onCheckedChange={s.setSpoiler}
              aria-label="Spoilerschutz"
            />
          }
        />

        <Card
          icon={<Bell />}
          title="Erinnerungen"
          text={
            support === "ios-needs-pwa"
              ? "Auf dem iPhone: erst über Teilen → „Zum Home-Bildschirm“ installieren, dann hier aktivieren."
              : hasPushBackend()
                ? "Push-Nachricht 15 Minuten vor Anpfiff – auch wenn die App geschlossen ist."
                : "Benachrichtigung 15 Minuten vor Anpfiff, solange KickTime geöffnet ist. Für zuverlässige Erinnerungen den Kalender-Export nutzen."
          }
          aside={
            <Switch
              checked={s.pushEnabled}
              onCheckedChange={async (v) => {
                if (!v) {
                  s.setPushEnabled(false);
                  toast("Erinnerungen deaktiviert");
                } else {
                  await enableReminders();
                }
              }}
              aria-label="Erinnerungen"
            />
          }
        >
          <label
            className={cn(
              "flex items-center justify-between gap-3 border-t border-border/70 pt-3",
              !s.pushEnabled && "opacity-50",
            )}
          >
            <span className="text-[13.5px]">Automatisch für alle Spiele meiner Favoriten</span>
            <Switch
              disabled={!s.pushEnabled}
              checked={s.autoAlarmFavorites}
              onCheckedChange={s.setAutoAlarmFavorites}
              aria-label="Automatisch für Favoriten"
            />
          </label>
          <button
            type="button"
            disabled={myUpcoming.length === 0}
            onClick={() => {
              downloadIcs(myUpcoming, "kicktime-meine-spiele.ics");
              toast.success(`${myUpcoming.length} Spiele exportiert`);
            }}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-[13.5px] font-medium disabled:opacity-40"
          >
            <CalendarPlus className="h-4 w-4" />
            {myUpcoming.length > 0
              ? `Meine ${myUpcoming.length} Spiele in den Kalender`
              : "Kalender-Export nach der Auslosung"}
          </button>
        </Card>

        <Card icon={<Palette />} title="Darstellung">
          <Segmented<ThemeMode>
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "dark", label: "Dunkel" },
              { value: "light", label: "Hell" },
            ]}
          />
          <div className="mt-4 text-[13px] text-muted-foreground">Akzentfarbe</div>
          <div className="mt-2 flex flex-wrap gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => s.setAccent(a.id)}
                aria-label={a.label}
                aria-pressed={s.accent === a.id}
                title={a.label}
                className={cn(
                  "h-10 w-10 rounded-full ring-offset-2 ring-offset-card transition-transform active:scale-90",
                  s.accent === a.id && "ring-2 ring-foreground",
                )}
                style={{ background: a.swatch }}
              />
            ))}
          </div>
        </Card>

        <DemoCard />
        <FeedbackCard />

        <Card icon={<RotateCcw />} title="Daten">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                s.restartOnboarding();
                window.scrollTo({ top: 0 });
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-[13.5px] font-medium"
            >
              <RotateCcw className="h-4 w-4" /> Einrichtung wiederholen
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-destructive/40 text-[13.5px] font-medium text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Alles löschen
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Wirklich alles löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Teams, Zeitfenster, Tipps und Erinnerungen werden von diesem Gerät entfernt. Das
                    lässt sich nicht rückgängig machen.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
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
        </Card>
      </div>

      <Footer />

      <Drawer open={teamsOpen} onOpenChange={setTeamsOpen} shouldScaleBackground={false}>
        <DrawerContent className="mx-auto h-[92dvh] max-w-2xl border-border bg-background">
          <div className="flex items-center justify-between px-4 pt-3">
            <DrawerTitle className="font-display text-2xl font-bold uppercase">
              Deine Teams
            </DrawerTitle>
            <button
              type="button"
              onClick={() => setTeamsOpen(false)}
              className="rounded-full bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground"
            >
              Fertig
            </button>
          </div>
          <DrawerDescription className="sr-only">
            Lieblings- und interessante Teams auswählen
          </DrawerDescription>
          <div className="overflow-y-auto px-4 pb-8 pt-3">
            <TeamPicker />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DemoCard() {
  const demo = useAppStore((s) => s.demo);
  const setDemo = useAppStore((s) => s.setDemo);
  return (
    <Card
      icon={<FlaskConical />}
      title="Vorschau-Modus"
      text="Spielt die EM mit einer erfundenen Auslosung und erfundenen Ergebnissen durch – zum Ausprobieren vor dem Turnier."
      aside={
        <Switch
          checked={demo.enabled}
          onCheckedChange={(v) => setDemo(v)}
          aria-label="Vorschau-Modus"
        />
      }
    >
      {demo.enabled && (
        <div className="grid gap-2">
          {DEMO_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setDemo(true, sc.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                demo.scenario === sc.id
                  ? "border-gold/60 bg-gold/10"
                  : "border-border hover:border-muted-foreground/40",
              )}
            >
              <div className="text-[14px] font-semibold">{sc.label}</div>
              <div className="text-[12px] text-muted-foreground">{sc.hint}</div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function FeedbackCard() {
  const [sent, setSent] = useState(false);
  const [text, setText] = useState("");
  if (!isBackendConfigured()) return null;
  const send = async (rating: FeedbackRating) => {
    haptics.tap();
    const ok = await submitFeedback(rating, text);
    if (ok) {
      setSent(true);
      toast.success("Danke für dein Feedback!");
    } else toast.error("Konnte nicht gesendet werden");
  };
  return (
    <Card
      icon={<MessageSquareHeart />}
      title="Wie gefällt dir KickTime?"
      text="Anonym – hilft, die App besser zu machen."
    >
      {sent ? (
        <p className="text-[13.5px] text-primary">Danke! 💚</p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Optional: Was fehlt dir, was stört?"
            className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[14px] outline-none focus:border-primary"
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                [-1, "👎", "Nicht so"],
                [0, "😐", "Geht so"],
                [1, "👍", "Super"],
              ] as const
            ).map(([r, e, l]) => (
              <button
                key={r}
                type="button"
                onClick={() => send(r)}
                className="flex h-14 flex-col items-center justify-center rounded-xl border border-border text-[12px] text-muted-foreground hover:border-primary/50"
              >
                <span className="text-xl">{e}</span>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Footer() {
  const [adminOpen, setAdminOpen] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  return (
    <footer className="mt-8 text-center text-[12px] text-muted-foreground">
      <a
        href={LEGAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        Datenschutz & Impressum <ExternalLink className="h-3 w-3" />
      </a>
      <p className="mt-2">
        KickTime ist ein privates Fan-Projekt und steht in keiner Verbindung zur UEFA.
      </p>
      <button
        type="button"
        className="mt-2"
        onClick={() => {
          const now = Date.now();
          if (now - taps.current.t > 1500) taps.current.n = 0;
          taps.current.n++;
          taps.current.t = now;
          if (taps.current.n >= 5) {
            taps.current.n = 0;
            haptics.success();
            setAdminOpen(true);
          }
        }}
      >
        KickTime {TOURNAMENT.year} · Version {APP_VERSION} · Made by Phantom Studios
      </button>
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </footer>
  );
}
