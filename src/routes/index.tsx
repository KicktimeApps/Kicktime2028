import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Clock3,
  FlaskConical,
  History,
  MapPin,
  Moon,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Chip } from "@/components/common/Chip";
import { EmptyState } from "@/components/common/EmptyState";
import { Section } from "@/components/common/Section";
import { Segmented } from "@/components/common/Segmented";
import { Countdown } from "@/components/dashboard/Countdown";
import { LiveStrip } from "@/components/dashboard/LiveStrip";
import { MatchCard } from "@/components/match/MatchCard";
import { useFitCount } from "@/components/settings/presets";
import { Flag } from "@/components/team/Flag";
import { statusChip } from "@/components/team/statusChip";
import { teamDisplay } from "@/domain/labels";
import { buildFeed, nextOwnMatch, type Recommendation } from "@/domain/recommend";
import { currentStage, tournamentWinner } from "@/domain/status";
import { formatDate, formatDayLong, formatTime, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { useTeamStatuses } from "@/hooks/useTeamStatuses";
import { downloadIcs } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { MILESTONES, STAGE_LABEL, TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";

export const Route = createFileRoute("/")({
  component: ForYou,
});

type Tab = "perfect" | "outside" | "bonus" | "recap";

function ForYou() {
  const tournament = useTournament();
  const now = useNow();
  const prefs = usePrefs();
  const matches = tournament.matches;
  const drawn = matches.some((m) => m.stage === "group" && m.home);
  const champion = tournamentWinner(tournament);
  const started = now >= Date.parse(TOURNAMENT.start);
  const feed = useMemo(() => buildFeed(matches, prefs), [matches, prefs]);
  const stage = currentStage(matches);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            {champion
              ? "Turnier beendet"
              : stage && started
                ? STAGE_LABEL[stage]
                : TOURNAMENT.longName}
          </div>
          <h1 className="font-display text-[2rem] font-bold uppercase leading-none tracking-tight md:text-4xl">
            {greeting(now, prefs.timeZone)}
          </h1>
        </div>
      </div>

      {champion ? (
        <ChampionBanner code={champion} />
      ) : !started ? (
        <OpenerHero now={now} matches={matches} />
      ) : (
        <NextHero matches={matches} now={now} />
      )}

      <LiveStrip matches={matches} />

      {drawn ? <Feed feed={feed} /> : <PreDraw />}
    </div>
  );
}

function greeting(now: number, tz: string) {
  const h = Number(formatTime(new Date(now).toISOString(), tz).slice(0, 2));
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

/* ------------------------------------------------------------------ */

function HeroShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-elevated via-card to-card p-5 md:p-7",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function OpenerHero({ now, matches }: { now: number; matches: MatchView[] }) {
  const opener = matches.find((m) => m.number === 1)!;
  const tz = usePrefs().timeZone;
  const a = teamDisplay(opener.home, opener.slotHome);
  const b = teamDisplay(opener.away, opener.slotAway);
  return (
    <HeroShell>
      <div className="text-[13px] font-medium text-muted-foreground">
        Anpfiff der {TOURNAMENT.name} in
      </div>
      <Countdown target={Date.parse(opener.kickoffUtc)} now={now} className="mt-3" />
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-4 text-[13px]">
        <span className="flex items-center gap-2 font-semibold">
          <Flag flag={a.flag} size="sm" /> {a.name}
          <span className="text-muted-foreground">–</span>
          <Flag flag={b.flag} size="sm" /> {b.name}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> {formatDate(opener.kickoffUtc, tz)}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {opener.venue.name}, {opener.venue.city}
        </span>
      </div>
    </HeroShell>
  );
}

function NextHero({ matches, now }: { matches: MatchView[]; now: number }) {
  const prefs = usePrefs();
  const openMatch = useUi((s) => s.openMatch);
  const own = nextOwnMatch(matches, prefs);
  const next = own ?? matches.find((m) => m.status === "scheduled");
  if (!next) return null;
  const a = teamDisplay(next.home, next.slotHome);
  const b = teamDisplay(next.away, next.slotAway);
  const rel = relativeDay(next.kickoffUtc, now, prefs.timeZone);
  const isLive = next.status === "live";
  return (
    <HeroShell>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">
          {own ? "Dein nächstes Spiel" : "Nächstes Spiel"}
        </span>
        {own && (
          <Chip tone="gold" icon={<Star />}>
            Für dich
          </Chip>
        )}
      </div>
      <button
        type="button"
        onClick={() => openMatch(next.id)}
        className="mt-4 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3"
      >
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Flag flag={a.flag} size="xl" />
          <span className="w-full truncate text-center font-display text-[22px] font-bold uppercase leading-none md:text-3xl">
            {a.name}
          </span>
        </div>
        <span className="text-[13px] font-semibold text-muted-foreground">vs</span>
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Flag flag={b.flag} size="xl" />
          <span className="w-full truncate text-center font-display text-[22px] font-bold uppercase leading-none md:text-3xl">
            {b.name}
          </span>
        </div>
      </button>
      {isLive ? (
        <div className="mt-4 text-[14px] font-semibold text-live">
          Läuft gerade – tippe für Details
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <Countdown target={Date.parse(next.kickoffUtc)} now={now} />
          <div className="text-right text-[13px] text-muted-foreground">
            <div className="font-semibold text-foreground">
              {rel ?? formatDayLong(next.kickoffUtc, prefs.timeZone)},{" "}
              {formatTime(next.kickoffUtc, prefs.timeZone)} Uhr
            </div>
            <div>
              {next.stage === "group" ? `Gruppe ${next.group}` : STAGE_LABEL[next.stage]} ·{" "}
              {next.venue.city}
            </div>
          </div>
        </div>
      )}
    </HeroShell>
  );
}

function ChampionBanner({ code }: { code: string }) {
  const n = getNation(code)!;
  const tournament = useTournament();
  const final = tournament.matches.find((m) => m.stage === "final")!;
  const hidden = useAppStore((s) => s.spoilerProtection && !s.revealed[final.id]);
  const reveal = useAppStore((s) => s.reveal);
  if (hidden) {
    return (
      <HeroShell className="border-gold/40">
        <div className="flex flex-wrap items-center gap-4">
          <Trophy className="h-12 w-12 shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold">
              Das Finale ist gespielt
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Der Spoilerschutz verbirgt den Europameister – bereit für die Auflösung?
            </p>
          </div>
          <button
            type="button"
            onClick={() => reveal(final.id)}
            className="h-11 rounded-full bg-gold px-5 text-[14px] font-semibold text-gold-foreground"
          >
            Europameister zeigen
          </button>
        </div>
      </HeroShell>
    );
  }
  return (
    <HeroShell className="border-gold/40">
      <div className="gold-shimmer pointer-events-none absolute inset-0 -m-7" aria-hidden />
      <div className="flex items-center gap-4">
        <Trophy className="h-12 w-12 shrink-0 fill-gold/25 text-gold" />
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-gold">
            Europameister {TOURNAMENT.year}
          </div>
          <div className="mt-1 flex items-center gap-3 font-display text-4xl font-bold uppercase leading-none">
            <Flag flag={n.flag} size="lg" /> {n.name}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Danke, dass du die EM mit KickTime begleitet hast.
          </p>
        </div>
      </div>
    </HeroShell>
  );
}

/* ------------------------------------------------------------------ */

function Feed({ feed }: { feed: ReturnType<typeof buildFeed> }) {
  const [tab, setTab] = useState<Tab>("perfect");
  const list: Recommendation[] = feed[tab];
  const upcomingMine = [...feed.perfect, ...feed.outside].map((r) => r.match);

  const empty: Record<Tab, { icon: React.ReactNode; title: string; text: string }> = {
    perfect: {
      icon: <CalendarCheck2 />,
      title: "Gerade nichts für dich",
      text: "Keine anstehenden Spiele deiner Teams in deinem Zeitfenster. Markiere weitere Teams oder merke einzelne Spiele vor.",
    },
    outside: {
      icon: <Moon />,
      title: "Alles im grünen Bereich",
      text: "Keins deiner Spiele kollidiert mit deinem Alltag.",
    },
    bonus: {
      icon: <Sparkles />,
      title: "Keine Bonus-Tipps",
      text: "Sobald Top-Duelle in deine freie Zeit fallen, schlagen wir sie hier vor.",
    },
    recap: {
      icon: <History />,
      title: "Noch nichts verpasst",
      text: "Beendete Spiele deiner Teams landen hier – Ergebnisse bleiben bei aktivem Spoilerschutz verborgen.",
    },
  };

  return (
    <div>
      <Segmented<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "perfect", label: "Für dich", count: feed.perfect.length },
          { value: "outside", label: "Später", count: feed.outside.length },
          { value: "bonus", label: "Bonus", count: feed.bonus.length },
          { value: "recap", label: "Rückblick" },
        ]}
      />
      <p className="mb-4 text-[13px] text-muted-foreground">
        {tab === "perfect" &&
          "Spiele deiner Teams, die in deine freie Zeit passen – einfach einschalten."}
        {tab === "outside" &&
          "Deine Spiele außerhalb deiner Zeit: Erinnerung stellen, aufnehmen oder später spoilerfrei nachholen."}
        {tab === "bonus" && "Keins deiner Teams, aber sehenswert und zeitlich passend."}
        {tab === "recap" && "Was deine Teams zuletzt gespielt haben."}
      </p>
      {list.length === 0 ? (
        <EmptyState {...empty[tab]} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => (
            <MatchCard
              key={r.match.id}
              match={r.match}
              showDate
              reasons={r.reasons}
              fit={tab === "recap" ? undefined : r.fit}
            />
          ))}
        </div>
      )}
      {upcomingMine.length > 0 && tab !== "recap" && (
        <button
          type="button"
          onClick={() => {
            downloadIcs(upcomingMine, "kicktime-meine-spiele.ics");
            toast.success(`${upcomingMine.length} Spiele exportiert`, {
              description: "Im Kalender öffnen und importieren.",
            });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <CalendarPlus className="h-4 w-4" /> Alle meine Spiele in den Kalender
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PreDraw() {
  const prefs = usePrefs();
  const statuses = useTeamStatuses();
  const openTeam = useUi((s) => s.openTeam);
  const setDemo = useAppStore((s) => s.setDemo);
  const now = useNow();
  const fit = useFitCount(prefs.availability, prefs.timeZone);
  const myTeams = [...prefs.favorites, ...prefs.interesting];

  return (
    <div className="grid gap-x-6 lg:grid-cols-2">
      <div>
        <Section
          title="Deine Teams"
          icon={<Star />}
          action={
            <Link to="/einstellungen" className="text-[13px] font-medium text-primary">
              Ändern
            </Link>
          }
        >
          {myTeams.length === 0 ? (
            <EmptyState
              icon={<Star />}
              title="Noch keine Teams"
              text="Wähle in den Einstellungen, wem du die Daumen drückst."
            />
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
              {myTeams.map((code) => {
                const n = getNation(code);
                if (!n) return null;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => openTeam(code)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <Flag flag={n.flag} size="md" />
                      <span className="flex-1 truncate font-semibold">{n.name}</span>
                      {prefs.favorites.includes(code) && (
                        <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                      )}
                      {statusChip(statuses.get(code))}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Sobald die Auslosung feststeht, erscheinen hier automatisch deine Spiele – mit Uhrzeit,
            TV-Sender und dem Hinweis, ob sie in deine Zeit passen.
          </p>
        </Section>

        <Section title="Deine Zeit" icon={<Clock3 />}>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-primary tabular">
                {fit.full}
              </span>
              <span className="text-[14px]">
                von {fit.total} Spielen passen komplett in deine Zeit
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Gespielt wird um 15, 18 und 21 Uhr (MESZ). Die genauen Zeiten folgen nach der
              Auslosung.
            </p>
            <Link
              to="/einstellungen"
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary"
            >
              Zeitfenster anpassen <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Section>
      </div>

      <div>
        <Section title="Fahrplan bis zum Finale" icon={<CalendarClock />}>
          <ol className="relative rounded-2xl border border-border bg-card px-4 py-2">
            {MILESTONES.map((ms, i) => {
              const done = Date.parse(ms.date) + 86_400_000 < now;
              const nextIdx = MILESTONES.findIndex((x) => Date.parse(x.date) + 86_400_000 >= now);
              return (
                <li key={ms.date} className="relative flex gap-3 py-2.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-card",
                        done
                          ? "bg-muted-foreground/40"
                          : i === nextIdx
                            ? "bg-primary"
                            : "bg-border",
                      )}
                    />
                    {i < MILESTONES.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className={cn("pb-0.5", done && "text-muted-foreground")}>
                    <div className="text-[12px] font-medium text-muted-foreground tabular">
                      {ms.approx && "ca. "}
                      {new Date(ms.date).toLocaleDateString(
                        "de-DE",
                        ms.approx
                          ? { month: "long", year: "numeric" }
                          : { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </div>
                    <div
                      className={cn("text-[14px] font-semibold", i === nextIdx && "text-primary")}
                    >
                      {ms.label}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section title="Schon mal reinschnuppern?" icon={<FlaskConical />}>
          <div className="rounded-2xl border border-gold/30 bg-gold/8 p-4">
            <p className="text-[13.5px] leading-relaxed">
              Der <strong>Vorschau-Modus</strong> spielt das Turnier mit einer erfundenen Auslosung
              durch – so siehst du schon heute, wie KickTime während der EM aussieht.
            </p>
            <button
              type="button"
              onClick={() => {
                setDemo(true, "group");
                window.scrollTo({ top: 0 });
                toast("Vorschau-Modus aktiv", {
                  description: "Beenden über das gelbe Banner oder in den Einstellungen.",
                });
              }}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-gold px-4 text-[14px] font-semibold text-gold-foreground"
            >
              <FlaskConical className="h-4 w-4" /> Vorschau starten
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
