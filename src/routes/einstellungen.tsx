import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  EyeOff,
  FlaskConical,
  MessageSquareHeart,
  Smartphone,
  Palette,
  Star,
} from "lucide-react";
import { type ReactNode } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { DeviceTransfer } from "@/components/settings/DeviceTransfer";
import { PRESETS, presetMatches } from "@/components/settings/presets";
import { Flag } from "@/components/team/Flag";
import { TeamPicker } from "@/components/team/TeamPicker";
import { Switch } from "@/components/ui/switch";
import { type ThemeMode } from "@/lib/theme";
import { isBackendConfigured } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { getNation } from "@/tournament/nations";
import {
  TimeContent,
  RemindersContent,
  AppearanceContent,
  DemoContent,
} from "@/components/settings/SettingsContent";
import { FeedbackContent } from "@/components/settings/FeedbackContent";
import { MoreList } from "@/components/settings/MoreList";

/** Unterpunkte der Einstellungen – jeder hat eine eigene Seite (?s=…). */
const SECTIONS = [
  "teams",
  "zeit",
  "erinnerungen",
  "darstellung",
  "vorschau",
  "feedback",
  "handywechsel",
] as const;

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
        <Group title="Tipprunden">
          <NavRow to="handywechsel" icon={<Smartphone />} title="Handy wechseln" />
        </Group>
      )}

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
  handywechsel: {
    title: "Handy wechseln",
    intro: "Tipprunden und Tipps aufs neue Handy mitnehmen – ohne Anmeldung, mit einem Code.",
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
        {section === "handywechsel" && <DeviceTransfer />}
      </div>
    </div>
  );
}
