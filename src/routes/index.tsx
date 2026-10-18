import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CalendarPlus, ChevronDown, ChevronRight, FlaskConical, Star, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Countdown } from "@/components/dashboard/Countdown";
import { FitNote, MatchList, MatchRow } from "@/components/dashboard/MatchRow";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { buildFeed, nextOwnMatch } from "@/domain/recommend";
import { currentStage, tournamentWinner } from "@/domain/status";
import { fitFor, formatDate, formatDayLong, formatTime, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { MILESTONES, STAGE_LABEL, TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";
import { getTvInfo } from "@/tournament/tv";

export const Route = createFileRoute("/")({
  component: ForYou,
});

/** Wie viele Spiele pro Abschnitt auf der Startseite – der Rest steht im Spielplan. */
const LIST_LIMIT = 3;

/**
 * Startseite. Bewusst schlicht: eine Spalte, klare Überschriften, jedes Spiel
 * eine Zeile. Reihenfolge nach Dringlichkeit: live → dein nächstes Spiel →
 * deine weiteren Spiele → sehenswert → zuletzt gespielt.
 */
function ForYou() {
  const tournament = useTournament();
  const now = useNow();
  const prefs = usePrefs();
  const matches = tournament.matches;
  const drawn = matches.some((m) => m.stage === "group" && m.home);
  const champion = tournamentWinner(tournament);
  const started = now >= Date.parse(TOURNAMENT.start);
  const stage = currentStage(matches);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="font-display text-[2rem] font-bold uppercase leading-none tracking-tight md:text-4xl">
          {greeting(now, prefs.timeZone)}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {champion
            ? `Die ${TOURNAMENT.name} ist vorbei.`
            : stage && started
              ? `${TOURNAMENT.name} · ${STAGE_LABEL[stage]}`
              : drawn
                ? `Bald geht's los: ${TOURNAMENT.name}`
                : `Noch ist Zeit bis zur ${TOURNAMENT.name}.`}
        </p>
      </header>

      {champion && <ChampionBanner code={champion} />}
      {drawn ? <Drawn started={started} /> : <PreDraw />}
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

function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreLink({ to, children }: { to: "/spielplan" | "/einstellungen"; children: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[14px] font-medium text-primary">
      {children} <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

function HeroShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative mb-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-elevated via-card to-card p-5 md:p-7",
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

/* ------------------------------------------------------------------ */

function Drawn({ started }: { started: boolean }) {
  const { matches } = useTournament();
  const prefs = usePrefs();
  const now = useNow();
  const feed = useMemo(() => buildFeed(matches, prefs), [matches, prefs]);
  // Sehenswert nur mit feststehenden Teams – „Sieger Spiel 39“ sagt niemandem etwas.
  const bonus = feed.bonus.filter((r) => r.match.home && r.match.away).slice(0, LIST_LIMIT);
  const live = matches.filter((m) => m.status === "live");
  const next = nextOwnMatch(matches, prefs);
  const upcoming = [...feed.perfect, ...feed.outside]
    .sort((a, b) => Date.parse(a.match.kickoffUtc) - Date.parse(b.match.kickoffUtc))
    .filter((r) => r.match.status === "scheduled");
  const rest = upcoming.filter((r) => r.match.id !== next?.id);
  const hasTeams = prefs.favorites.length + prefs.interesting.length > 0;

  return (
    <>
      {live.length > 0 && (
        <Block title="Jetzt live">
          <MatchList className="border-live/40">
            {live.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </MatchList>
        </Block>
      )}

      {!started && !next ? (
        <OpenerHero now={now} matches={matches} />
      ) : next ? (
        <NextHero match={next} now={now} />
      ) : null}

      {!hasTeams && (
        <Block title="Deine Spiele">
          <div className="rounded-2xl border border-border bg-card p-4 text-[15px]">
            Du hast noch keine Teams ausgewählt.{" "}
            <Link to="/einstellungen" className="font-semibold text-primary">
              Jetzt Teams wählen
            </Link>
          </div>
        </Block>
      )}

      {rest.length > 0 && (
        <Block title="Deine weiteren Spiele" action={<MoreLink to="/spielplan">Alle</MoreLink>}>
          <MatchList>
            {rest.slice(0, LIST_LIMIT).map((r) => (
              <MatchRow key={r.match.id} match={r.match} fit={r.fit} />
            ))}
          </MatchList>
          <button
            type="button"
            onClick={() => {
              const list = upcoming.map((r) => r.match);
              downloadIcs(list, "kicktime-meine-spiele.ics");
              toast.success(`${list.length} Spiele exportiert`, {
                description: "Im Kalender öffnen und importieren.",
              });
            }}
            className="mt-3 inline-flex items-center gap-2 text-[14px] font-medium text-muted-foreground hover:text-foreground"
          >
            <CalendarPlus className="h-4 w-4" /> Alle meine Spiele in den Kalender
          </button>
        </Block>
      )}

      {bonus.length > 0 && (
        <Block title="Auch sehenswert">
          <MatchList>
            {bonus.map((r) => (
              <MatchRow key={r.match.id} match={r.match} fit={r.fit} />
            ))}
          </MatchList>
        </Block>
      )}

      {feed.recap.length > 0 && (
        <Block title="Zuletzt gespielt">
          <MatchList>
            {feed.recap.slice(0, LIST_LIMIT).map((r) => (
              <MatchRow key={r.match.id} match={r.match} />
            ))}
          </MatchList>
        </Block>
      )}
    </>
  );
}

function OpenerHero({ now, matches }: { now: number; matches: MatchView[] }) {
  const opener = matches.find((m) => m.number === 1)!;
  const tz = usePrefs().timeZone;
  return (
    <HeroShell>
      <div className="text-[15px] font-medium text-muted-foreground">
        Bis zum Anpfiff der {TOURNAMENT.name}
      </div>
      <Countdown target={Date.parse(opener.kickoffUtc)} now={now} className="mt-3" />
      <p className="mt-5 border-t border-border/70 pt-4 text-[15px]">
        <span className="font-semibold">Eröffnungsspiel</span>
        <br />
        <span className="text-muted-foreground">
          {formatDate(opener.kickoffUtc, tz)} in {opener.venue.city}
        </span>
      </p>
    </HeroShell>
  );
}

function untilText(target: number, now: number) {
  const min = Math.max(0, Math.round((target - now) / 60_000));
  if (min < 60) return `noch ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `noch ${h} Std. ${min % 60} Min.`;
  const d = Math.round(h / 24);
  return d === 1 ? "noch 1 Tag" : `noch ${d} Tage`;
}

function NextHero({ match: m, now }: { match: MatchView; now: number }) {
  const prefs = usePrefs();
  const openMatch = useUi((s) => s.openMatch);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const rel = relativeDay(m.kickoffUtc, now, prefs.timeZone);
  const fit = fitFor(m.kickoffUtc, prefs.timeZone, prefs.availability);
  return (
    <HeroShell className="p-0 md:p-0">
      <button
        type="button"
        onClick={() => openMatch(m.id)}
        className="block w-full p-5 text-left md:p-7"
        aria-label={`Dein nächstes Spiel: ${a.name} gegen ${b.name}, Details öffnen`}
      >
        <div className="text-[15px] font-medium text-muted-foreground">Dein nächstes Spiel</div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {[a, b].map((t, i) => (
            <div
              key={i}
              className={cn("flex min-w-0 flex-col items-center gap-2", i === 1 && "col-start-3")}
            >
              <Flag flag={t.flag} size="xl" />
              <span className="w-full truncate text-center font-display text-[22px] font-bold uppercase leading-none md:text-3xl">
                {t.name}
              </span>
            </div>
          ))}
          <span className="col-start-2 row-start-1 text-[14px] font-semibold text-muted-foreground">
            gegen
          </span>
        </div>

        <div className="mt-6 text-center">
          <div className="font-display text-[30px] font-bold leading-none md:text-4xl">
            {rel ?? formatDayLong(m.kickoffUtc, prefs.timeZone)},{" "}
            {formatTime(m.kickoffUtc, prefs.timeZone)} Uhr
          </div>
          <div className="mt-2 text-[15px] text-muted-foreground">
            {untilText(Date.parse(m.kickoffUtc), now)}
            <br />
            im TV: {getTvInfo(m).label}
          </div>
          <FitNote fit={fit} className="mt-3 text-[15px] font-medium" />
        </div>

        <div className="mt-5 flex items-center justify-center gap-1 border-t border-border/70 pt-4 text-[14px] font-medium text-primary">
          Details, Erinnerung & Kalender <ChevronRight className="h-4 w-4" />
        </div>
      </button>
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
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Trophy className="h-12 w-12 shrink-0 text-gold" />
          <div className="min-w-0 sm:flex-1">
            <div className="text-[17px] font-bold">Das Finale ist gespielt</div>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Der Spoilerschutz verbirgt noch den Europameister.
            </p>
          </div>
          <button
            type="button"
            onClick={() => reveal(final.id)}
            className="h-12 w-full rounded-full bg-gold px-5 text-[15px] font-semibold text-gold-foreground sm:w-auto"
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
          <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-gold">
            Europameister {TOURNAMENT.year}
          </div>
          <div className="mt-1 flex items-center gap-3 font-display text-4xl font-bold uppercase leading-none">
            <Flag flag={n.flag} size="lg" /> {n.name}
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Danke, dass du die EM mit KickTime begleitet hast.
          </p>
        </div>
      </div>
    </HeroShell>
  );
}

/* ------------------------------------------------------------------ */

function PreDraw() {
  const prefs = usePrefs();
  const openTeam = useUi((s) => s.openTeam);
  const setDemo = useAppStore((s) => s.setDemo);
  const now = useNow();
  const [allSteps, setAllSteps] = useState(false);
  const myTeams = [...prefs.favorites, ...prefs.interesting];
  const nextIdx = MILESTONES.findIndex((x) => Date.parse(x.date) + 86_400_000 >= now);
  const steps = allSteps ? MILESTONES : MILESTONES.slice(Math.max(0, nextIdx), nextIdx + 2);

  return (
    <>
      <OpenerHero now={now} matches={useTournament().matches} />

      <Block title="Deine Teams" action={<MoreLink to="/einstellungen">Ändern</MoreLink>}>
        {myTeams.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-[15px]">
            Du hast noch keine Teams ausgewählt.{" "}
            <Link to="/einstellungen" className="font-semibold text-primary">
              Jetzt Teams wählen
            </Link>
          </div>
        ) : (
          <MatchList>
            {myTeams.map((code) => {
              const n = getNation(code);
              if (!n) return null;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => openTeam(code)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40"
                >
                  <Flag flag={n.flag} size="md" />
                  <span className="flex-1 truncate text-[16px] font-semibold">{n.name}</span>
                  {prefs.favorites.includes(code) && (
                    <Star className="h-4 w-4 fill-gold text-gold" aria-label="Favorit" />
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
                </button>
              );
            })}
          </MatchList>
        )}
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Nach der Auslosung erscheinen hier deine Spiele mit Uhrzeit und Sender.
        </p>
      </Block>

      <Block title="Wie geht es weiter?">
        <ol className="rounded-2xl border border-border bg-card px-4 py-1">
          {steps.map((ms) => {
            const i = MILESTONES.indexOf(ms);
            const done = i < nextIdx || nextIdx === -1;
            return (
              <li
                key={ms.date}
                className={cn(
                  "flex items-baseline justify-between gap-4 border-b border-border/60 py-3 last:border-0",
                  done && "text-muted-foreground",
                )}
              >
                <span className={cn("text-[16px] font-semibold", i === nextIdx && "text-primary")}>
                  {ms.label}
                </span>
                <span className="shrink-0 text-[14px] text-muted-foreground tabular">
                  {ms.approx && "ca. "}
                  {new Date(ms.date).toLocaleDateString(
                    "de-DE",
                    ms.approx
                      ? { month: "short", year: "numeric" }
                      : { day: "numeric", month: "short", year: "numeric" },
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => setAllSteps((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-primary"
        >
          {allSteps ? "Weniger anzeigen" : "Alle Termine bis zum Finale"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", allSteps && "rotate-180")} />
        </button>
      </Block>

      <button
        type="button"
        onClick={() => {
          setDemo(true, "group");
          window.scrollTo({ top: 0 });
          toast("Vorschau-Modus aktiv", {
            description: "Beenden über das gelbe Band oben oder im Profil.",
          });
        }}
        className="flex w-full items-center gap-4 rounded-2xl border border-gold/30 bg-gold/8 p-4 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground">
          <FlaskConical className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">Vorschau ansehen</span>
          <span className="block text-[14px] text-muted-foreground">
            So sieht KickTime während der EM aus.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
      </button>
    </>
  );
}
