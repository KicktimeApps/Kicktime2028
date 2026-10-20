import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Bell,
  BellRing,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  EyeOff,
  FlaskConical,
  Info,
  MessageSquareHeart,
  Palette,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Segmented } from "@/components/common/Segmented";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { PRESETS, presetMatches } from "@/components/settings/presets";
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
import { Switch } from "@/components/ui/switch";
import { DEMO_SCENARIOS } from "@/demo/demo";
import { recommend } from "@/domain/recommend";
import { COMMON_TIME_ZONES, detectTimeZone } from "@/domain/time";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { submitFeedback, type FeedbackCategory, type FeedbackRating } from "@/lib/feedback";
import { haptics } from "@/lib/haptics";
import { detectPushSupport } from "@/lib/notifications";
import { hasPushBackend, sendTestPush, syncServerAlarms } from "@/lib/push";
import { enableReminders } from "@/lib/reminders";
import { ACCENTS, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { isBackendConfigured } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { LEGAL_URL, TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";

/** Unterpunkte der Einstellungen – jeder hat eine eigene Seite (?s=…). */
const SECTIONS = ["teams", "zeit", "erinnerungen", "darstellung", "vorschau", "feedback"] as const;
type Section = (typeof SECTIONS)[number];

export const Route = createFileRoute("/einstellungen")({
  head: () => ({
    meta: [{ title: "Einstellungen | KickTime" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): { s?: Section } => ({
    s: SECTIONS.includes(search.s as Section) ? (search.s as Section) : undefined,
  }),
  component: SettingsPage,
});

const THEME_LABEL: Record<ThemeMode, string> = {
  system: "Wie System",
  dark: "Dunkel",
  light: "Hell",
};

function SettingsPage() {
  const { s: section } = Route.useSearch();
  if (section) return <SubPage section={section} />;
  return <Overview />;
}

/* ---------------------------------------------------------------- Übersicht */

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]">
      {children}
    </span>
  );
}

/** Zeile, die zu einem Unterpunkt führt – links Symbol und Name, rechts der aktuelle Wert. */
function NavRow({
  to,
  icon,
  title,
  value,
}: {
  to: Section;
  icon: ReactNode;
  title: string;
  value?: ReactNode;
}) {
  return (
    <Link
      to="/einstellungen"
      search={{ s: to }}
      className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <RowIcon>{icon}</RowIcon>
      <span className="flex-1 text-[16px] font-medium">{title}</span>
      {value && (
        <span className="max-w-[45%] truncate text-right text-[14px] text-muted-foreground">
          {value}
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

function Overview() {
  const s = useAppStore();
  const myTeams = [...s.favorites, ...s.interesting];
  const preset = PRESETS.find((p) => p.id === presetMatches(s.availability));
  const firstTeam = getNation(myTeams[0]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Profil"
        title="Einstellungen"
        subtitle="Alles wird nur auf diesem Gerät gespeichert."
      />

      <Group title="Für dich">
        <NavRow
          to="teams"
          icon={<Star />}
          title="Deine Teams"
          value={
            firstTeam ? (
              <span className="inline-flex items-center gap-1.5">
                <Flag flag={firstTeam.flag} size="sm" />
                {firstTeam.name}
                {myTeams.length > 1 && ` +${myTeams.length - 1}`}
              </span>
            ) : (
              "Keine"
            )
          }
        />
        <NavRow
          to="zeit"
          icon={<Clock3 />}
          title="Deine Zeit"
          value={preset?.label ?? "Eigene Zeiten"}
        />
        <NavRow
          to="erinnerungen"
          icon={<Bell />}
          title="Erinnerungen"
          value={s.pushEnabled ? "An" : "Aus"}
        />
      </Group>

      <Group title="Anzeige">
        <label className="flex min-h-[60px] items-center gap-3 px-4 py-3">
          <RowIcon>
            <EyeOff />
          </RowIcon>
          <span className="flex-1">
            <span className="block text-[16px] font-medium">Spoilerschutz</span>
            <span className="block text-[13px] text-muted-foreground">
              Ergebnisse erst auf Tippen zeigen
            </span>
          </span>
          <Switch
            checked={s.spoilerProtection}
            onCheckedChange={s.setSpoiler}
            aria-label="Spoilerschutz"
          />
        </label>
        <NavRow
          to="darstellung"
          icon={<Palette />}
          title="Darstellung"
          value={THEME_LABEL[s.theme] + (s.largeText ? " · groß" : "")}
        />
        <NavRow
          to="vorschau"
          icon={<FlaskConical />}
          title="Vorschau-Modus"
          value={s.demo.enabled ? "An" : "Aus"}
        />
      </Group>

      {isBackendConfigured() && (
        <Group title="Mithelfen">
          <NavRow to="feedback" icon={<MessageSquareHeart />} title="Feedback geben" />
        </Group>
      )}

      <MoreList
        onRestart={() => {
          s.restartOnboarding();
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- Unterseiten */

const SECTION_META: Record<Section, { title: string; intro?: string }> = {
  teams: {
    title: "Deine Teams",
    intro:
      "„Favorit“: dein Herzensteam – steht ganz oben und bekommt automatisch Erinnerungen. „Folgen“: interessiert dich ebenfalls.",
  },
  zeit: { title: "Deine Zeit", intro: "Wann kannst du in der Regel Fußball schauen?" },
  erinnerungen: { title: "Erinnerungen" },
  darstellung: { title: "Darstellung" },
  vorschau: {
    title: "Vorschau-Modus",
    intro:
      "Spielt die EM mit einer erfundenen Auslosung und erfundenen Ergebnissen durch – zum Ausprobieren vor dem Turnier.",
  },
  feedback: {
    title: "Feedback geben",
    intro: "Idee, Fehler oder Lob – geht anonym direkt ans KickTime-Team.",
  },
};

function SubPage({ section }: { section: Section }) {
  const meta = SECTION_META[section];
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/einstellungen"
        search={{}}
        onClick={(e) => {
          // Zurück im Verlauf statt neuem Eintrag – sonst öffnet die
          // Wisch-Geste danach wieder die Unterseite.
          if (router.history.canGoBack()) {
            e.preventDefault();
            router.history.back();
          }
        }}
        className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pl-1 pr-3 text-[15px] font-medium text-primary hover:bg-primary/10"
      >
        <ChevronLeft className="h-5 w-5" /> Einstellungen
      </Link>
      <h1 className="font-display text-[2rem] font-bold uppercase leading-none tracking-tight md:text-4xl">
        {meta.title}
      </h1>
      {meta.intro && <p className="mt-2 text-[15px] text-muted-foreground">{meta.intro}</p>}
      <div className="mt-5">
        {section === "teams" && <TeamPicker />}
        {section === "zeit" && <TimeContent />}
        {section === "erinnerungen" && <RemindersContent />}
        {section === "darstellung" && <AppearanceContent />}
        {section === "vorschau" && <DemoContent />}
        {section === "feedback" && <FeedbackContent />}
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      {children}
    </section>
  );
}

function TimeContent() {
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

function RemindersContent() {
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

function AppearanceContent() {
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
                "h-11 w-11 rounded-full ring-offset-2 ring-offset-card transition-transform active:scale-90",
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

function DemoContent() {
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
        </div>
      )}
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

const FEEDBACK_KINDS: {
  value: FeedbackCategory;
  emoji: string;
  label: string;
  placeholder: string;
}[] = [
  {
    value: "idee",
    emoji: "💡",
    label: "Idee",
    placeholder: "Was würdest du dir wünschen?",
  },
  {
    value: "fehler",
    emoji: "🐞",
    label: "Fehler",
    placeholder: "Was ist passiert – und wo in der App? (z. B. „Tipps → Spieltag 2: …“)",
  },
  { value: "lob", emoji: "💚", label: "Lob", placeholder: "Was gefällt dir besonders?" },
  {
    value: "sonstiges",
    emoji: "💬",
    label: "Sonstiges",
    placeholder: "Was möchtest du uns sagen?",
  },
];

const FEEDBACK_RATINGS: { value: FeedbackRating; emoji: string; label: string }[] = [
  { value: -1, emoji: "👎", label: "Nicht so" },
  { value: 0, emoji: "😐", label: "Geht so" },
  { value: 1, emoji: "👍", label: "Super" },
];

function FeedbackContent() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<FeedbackCategory | null>(null);
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [text, setText] = useState("");
  if (!isBackendConfigured()) return null;

  const current = FEEDBACK_KINDS.find((k) => k.value === kind);
  const ready = !!kind && (text.trim().length >= 3 || rating !== null);

  const send = async () => {
    if (!kind || !ready || busy) return;
    haptics.tap();
    setBusy(true);
    const res = await submitFeedback({ category: kind, rating, message: text });
    setBusy(false);
    if (res === "ok") {
      setSent(true);
      setKind(null);
      setRating(null);
      setText("");
    } else if (res === "limit") {
      toast("Für heute ist genug Feedback angekommen", {
        description: "Danke! Morgen kannst du wieder etwas schicken.",
      });
    } else toast.error("Konnte nicht gesendet werden – bitte später noch mal.");
  };

  if (sent)
    return (
      <Panel className="py-8 text-center">
        <div className="text-4xl">💚</div>
        <p className="mt-2 text-[16px] font-semibold">Danke für dein Feedback!</p>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Es ist direkt beim KickTime-Team angekommen.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-[14px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Noch etwas schicken
        </button>
      </Panel>
    );

  const chip = (active: boolean) =>
    cn(
      "flex items-center justify-center gap-2 rounded-xl border px-3 text-[14px] font-medium transition-colors",
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:border-primary/50",
    );

  return (
    <Panel className="space-y-4">
      <div>
        <div className="mb-2 text-[13px] font-semibold">Worum geht’s?</div>
        <div className="grid grid-cols-2 gap-2">
          {FEEDBACK_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => {
                haptics.tap();
                setKind(k.value);
              }}
              className={cn(chip(kind === k.value), "h-12")}
            >
              <span className="text-lg">{k.emoji}</span>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <>
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={current.placeholder}
              className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[15px] outline-none focus:border-primary"
            />
            <div className="mt-1 text-right text-[11.5px] text-muted-foreground tabular">
              {text.length}/1000
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold">
              Wie gefällt dir KickTime?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FEEDBACK_RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={rating === r.value}
                  onClick={() => {
                    haptics.tap();
                    setRating(rating === r.value ? null : r.value);
                  }}
                  className={cn(chip(rating === r.value), "h-14 flex-col gap-0 text-[12.5px]")}
                >
                  <span className="text-xl leading-tight">{r.emoji}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={send}
            disabled={!ready || busy}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? "Wird gesendet …" : "Absenden"}
          </button>
          <p className="text-center text-[12px] text-muted-foreground">
            Anonym – ohne Namen oder Konto.
          </p>
        </>
      )}
    </Panel>
  );
}

/** Abschluss der Übersicht: Rechtliches, Neustart, Löschen und Versionszeile. */
function MoreList({ onRestart }: { onRestart: () => void }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  const row =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] transition-colors hover:bg-muted/40";
  return (
    <div>
      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className={row}>
          <Info className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="flex-1">Datenschutz & Impressum</span>
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
                Teams, Zeitfenster, Tipps und Erinnerungen werden von diesem Gerät entfernt. Das
                lässt sich nicht rückgängig machen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  // Erst die Server-Erinnerungen stoppen, solange die Geräte-ID noch da ist.
                  if (hasPushBackend()) await syncServerAlarms([]).catch(() => {});
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

      {/* 5× tippen öffnet den Admin-Bereich */}
      <button
        type="button"
        className="mx-auto mt-5 block px-4 text-center text-[12px] leading-relaxed text-muted-foreground"
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
        KickTime {TOURNAMENT.year} · Version {APP_VERSION} · PhanDev Studios
        <br />
        Privates Fan-Projekt ohne Verbindung zur UEFA
      </button>
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}
