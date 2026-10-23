import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Play,
  Star,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Countdown } from "@/components/dashboard/Countdown";
import { LiveBar } from "@/components/dashboard/LiveBar";
import { FitNote, MatchList } from "@/components/dashboard/MatchList";
import { MatchCard } from "@/components/match/MatchCard";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { buildPills, type PillId } from "@/domain/pills";
import { useTeamStatuses } from "@/hooks/useTeamStatuses";
import { nextOwnMatch } from "@/domain/recommend";
import { currentStage, tournamentWinner } from "@/domain/status";
import {
  fitFor,
  formatDate,
  formatDayLong,
  formatTime,
  localParts,
  relativeDay,
} from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { MILESTONES, STAGE_LABEL, TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";
import { BROADCASTER_URLS, broadcastersOf, getTvInfo } from "@/tournament/tv";
import { VENUES } from "@/tournament/venues";

export const Route = createFileRoute("/")({
  component: ForYou,
});

/**
 * Startseite: oben „Jetzt live“ und „Dein nächstes Spiel“, darunter – wie bei
 * KickTime 2026 – Pillen, die alle Spiele der laufenden Turnierphase sortieren
 * (passt in deine Zeit · außerhalb · Top · alle · Ergebnisse).
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
      <header className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-display text-[1.6rem] font-bold uppercase leading-none tracking-tight md:text-3xl">
          <Greeting tz={prefs.timeZone} />
        </h1>
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          {champion ? "Beendet" : stage && started ? STAGE_LABEL[stage] : TOURNAMENT.name}
        </span>
      </header>

      {champion && <ChampionBanner code={champion} />}
      {drawn ? <Drawn started={started} /> : <PreDraw />}
    </div>
  );
}

/**
 * Begrüßung nach der echten Uhrzeit – nicht nach der Turnier-Uhr, die im
 * Vorschau-Modus simuliert ist. Aktualisiert sich jede Minute.
 */
function Greeting({ tz }: { tz: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return <>{greeting(now, tz)}</>;
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

const PILLS: { id: PillId; label: string; hint: string; empty: string }[] = [
  {
    id: "perfect",
    label: "Passt mir",
    hint: "Deine Teams, passend zu deiner Zeit.",
    empty: "Gerade kein Spiel deiner Teams in deiner Zeit.",
  },
  {
    id: "outside",
    label: "Andere Zeit",
    hint: "Deine Teams außerhalb deiner Zeit – Erinnerung stellen?",
    empty: "Alle Spiele deiner Teams passen in deine Zeit.",
  },
  {
    id: "results",
    label: "Ergebnisse",
    hint: "So haben deine Teams gespielt.",
    empty: "Deine Teams haben noch nicht gespielt.",
  },
];

function Drawn({ started }: { started: boolean }) {
  const tournament = useTournament();
  const { matches } = tournament;
  const prefs = usePrefs();
  const now = useNow();
  const live = matches.filter((m) => m.status === "live");
  const next = nextOwnMatch(matches, prefs);
  const pills = useMemo(() => buildPills(matches, prefs), [matches, prefs]);
  const [pill, setPill] = useState<PillId>(() =>
    pills.perfect.length ? "perfect" : pills.outside.length ? "outside" : "results",
  );
  const hasTeams = prefs.favorites.length + prefs.interesting.length > 0;
  // Deine Teams spielen nicht mehr (ausgeschieden oder Turnier vorbei)?
  // Dann passen „Passt mir“/„Andere Zeit“ nicht mehr – ehrliche Texte statt
  // „gerade kein Spiel“, nach dem Finale ganz ohne Pillen als Rückblick.
  const done = hasTeams && pills.perfect.length + pills.outside.length === 0;
  // „Ausgeschieden“ nur, wenn es wirklich stimmt – sonst steht der nächste
  // Gegner nur noch nicht fest (z. B. zwischen Gruppenphase und Achtelfinale).
  const statuses = useTeamStatuses();
  // Bei Spoilerschutz nichts verraten – „ausgeschieden“ wäre ein Ergebnis.
  const spoilerOn = useAppStore((s) => s.spoilerProtection);
  const allOut =
    hasTeams &&
    [...prefs.favorites, ...prefs.interesting].every((c) => {
      const phase = statuses.get(c)?.phase;
      return phase === "out" || phase === "missed";
    });
  const over = !!tournamentWinner(tournament);
  const retro = over && pills.results.length > 0;
  const meta = PILLS.find((p) => p.id === pill)!;
  const active = retro ? "results" : pill;
  const list = pills[active];
  const mine = [...pills.perfect, ...pills.outside];
  const hint = retro
    ? `Alle Spiele deiner Teams bei der ${TOURNAMENT.name} – neueste zuerst.`
    : meta.hint;
  const empty =
    done && active !== "results"
      ? over
        ? "Die EM ist vorbei – alle Spiele deiner Teams findest du unter „Ergebnisse“."
        : spoilerOn
          ? "Gerade steht kein weiteres Spiel deiner Teams an."
          : allOut
            ? "Deine Teams sind ausgeschieden – sie haben kein Spiel mehr. Unter „Ergebnisse“ siehst du ihre Spiele, im Spielplan alle weiteren."
            : "Das nächste Spiel deiner Teams steht noch nicht fest – es erscheint hier, sobald der Gegner feststeht."
      : meta.empty;

  return (
    <>
      <LiveBar matches={live} />

      {/* Vor dem Anpfiff der Countdown; danach zeigen die Pillen alles – ohne
          das nächste Spiel doppelt aufzuführen. Nur kurz vor Anpfiff ein
          schmaler Hinweis mit Sender zum Einschalten. */}
      {!started ? (
        <OpenerHero now={now} matches={matches} />
      ) : next && Date.parse(next.kickoffUtc) - now <= 30 * 60_000 ? (
        <NextHero match={next} now={now} />
      ) : null}

      {!hasTeams && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 text-[15px]">
          Du hast noch keine Teams ausgewählt.{" "}
          <Link to="/einstellungen" search={{ s: "teams" }} className="font-semibold text-primary">
            Jetzt Teams wählen
          </Link>
        </div>
      )}

      {retro ? (
        <h2 className="text-[19px] font-bold tracking-tight">Deine EM im Rückblick</h2>
      ) : (
        <div
          role="tablist"
          aria-label="Deine Spiele"
          className="grid grid-cols-3 gap-1 rounded-full border border-border bg-card p-1"
        >
          {PILLS.map((p) => {
            const active = p.id === pill;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPill(p.id)}
                className={cn(
                  "flex h-9 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 text-[13px] font-semibold transition-colors min-[380px]:text-[14px]",
                  active ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                <span className="truncate">{p.label}</span>
                <span
                  className={cn(
                    "shrink-0 text-[12px] tabular",
                    active ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {pills[p.id].length}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="mb-4 mt-2 px-1 text-[13px] text-muted-foreground">{hint}</p>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[15px] text-muted-foreground">
          {empty}
        </div>
      ) : (
        <DayGroups matches={list} />
      )}

      {pill !== "results" && mine.length > 0 && (
        <button
          type="button"
          onClick={() => {
            downloadIcs(mine, "kicktime-meine-spiele.ics");
            toast.success(`${mine.length} Spiele exportiert`, {
              description: "Im Kalender öffnen und importieren.",
            });
          }}
          className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-muted-foreground hover:text-foreground"
        >
          <CalendarPlus className="h-4 w-4" /> Alle meine Spiele in den Kalender
        </button>
      )}
    </>
  );
}

/** Spiele nach Tagen gruppiert, mit „Heute“/„Morgen“ als Überschrift. */
function DayGroups({ matches }: { matches: MatchView[] }) {
  const prefs = usePrefs();
  const tz = prefs.timeZone;
  const now = useNow();
  const days: { key: string; label: string; items: MatchView[] }[] = [];
  for (const m of matches) {
    const key = localParts(m.kickoffUtc, tz).dayKey;
    let day = days.find((d) => d.key === key);
    if (!day) {
      const rel = relativeDay(m.kickoffUtc, now, tz);
      day = {
        key,
        label: rel ? `${rel}, ${formatDayLong(m.kickoffUtc, tz)}` : formatDayLong(m.kickoffUtc, tz),
        items: [],
      };
      days.push(day);
    }
    day.items.push(m);
  }
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.key}>
          <h3 className="mb-2.5 text-[15px] font-bold">{d.label}</h3>
          <div className="grid grid-cols-1 gap-3">
            {d.items.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="min-w-0"
              >
                <MatchCard match={m} />
              </motion.div>
            ))}
          </div>
        </section>
      ))}
    </div>
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
  const d = Math.floor(h / 24);
  return d === 1 ? "noch 1 Tag" : `noch ${d} Tage`;
}

function NextHero({ match: m, now }: { match: MatchView; now: number }) {
  const prefs = usePrefs();
  const openMatch = useUi((s) => s.openMatch);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const rel = relativeDay(m.kickoffUtc, now, prefs.timeZone);
  const fit = fitFor(m.kickoffUtc, prefs.timeZone, prefs.availability);
  // 30 Minuten vor Anpfiff: Sender direkt antippbar.
  const soon = Date.parse(m.kickoffUtc) - now <= 30 * 60_000;
  return (
    <HeroShell className="mb-5 p-0 md:p-0">
      <button
        type="button"
        onClick={() => openMatch(m.id)}
        className="block w-full px-4 py-3.5 text-left"
        aria-label={`Dein nächstes Spiel: ${a.name} gegen ${b.name}, Details öffnen`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-muted-foreground">Dein nächstes Spiel</span>
          <span className="font-display text-[20px] font-bold leading-none">
            {rel ?? formatDayLong(m.kickoffUtc, prefs.timeZone)},{" "}
            {formatTime(m.kickoffUtc, prefs.timeZone)}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[18px] font-bold leading-tight">
            <span className="inline-flex items-center gap-2">
              <Flag flag={a.flag} size="md" />
              {a.name}
            </span>
            <span className="text-[14px] font-normal text-muted-foreground">gegen</span>
            <span className="inline-flex items-center gap-2">
              <Flag flag={b.flag} size="md" />
              {b.name}
            </span>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
        </div>
        <div className="mt-2 text-[13px] text-muted-foreground">
          {untilText(Date.parse(m.kickoffUtc), now)} · {getTvInfo(m).label}
        </div>
        <FitNote fit={fit} className="mt-1 text-[13px] font-medium" />
      </button>
      {soon && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-3">
          <span className="text-[13px] font-semibold">Gleich geht's los – einschalten:</span>
          {broadcastersOf(getTvInfo(m)).map((name) => (
            <a
              key={name}
              href={BROADCASTER_URLS[name]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> {name}
            </a>
          ))}
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
  const now = useNow();
  const [allSteps, setAllSteps] = useState(false);
  const myTeams = [...prefs.favorites, ...prefs.interesting];
  const nextIdx = MILESTONES.findIndex((x) => Date.parse(x.date) + 86_400_000 >= now);
  const steps = allSteps ? MILESTONES : MILESTONES.slice(Math.max(0, nextIdx), nextIdx + 2);

  return (
    <>
      <OpenerHero now={now} matches={useTournament().matches} />

      <PreviewOffer />

      <Block title="Deine Teams" action={<MoreLink to="/einstellungen">Ändern</MoreLink>}>
        {myTeams.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-[15px]">
            Du hast noch keine Teams ausgewählt.{" "}
            <Link
              to="/einstellungen"
              search={{ s: "teams" }}
              className="font-semibold text-primary"
            >
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

      <Block title="Die Gastgeber">
        <div className="grid grid-cols-2 gap-2">
          {HOST_CODES.map((code) => {
            const n = getNation(code);
            if (!n) return null;
            return (
              <button
                key={code}
                type="button"
                onClick={() => openTeam(code)}
                className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-3.5 text-left hover:bg-muted/40"
              >
                <Flag flag={n.flag} size="md" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{n.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Die EURO 2028 findet erstmals in vier Ländern auf zwei Inseln statt.
        </p>
      </Block>

      <Block title={`Die ${VENUES.length} Stadien`}>
        <StadiumRail />
      </Block>
    </>
  );
}

const HOST_CODES = ["ENG", "SCO", "WAL", "IRL"] as const;

/** Vor der Auslosung gut sichtbar: die Vorschau zeigt, wie KickTime während der EM aussieht. */
function PreviewOffer() {
  const setDemo = useAppStore((s) => s.setDemo);
  return (
    <button
      type="button"
      onClick={() => {
        setDemo(true, "group");
        window.scrollTo({ top: 0 });
        toast("Vorschau-Modus aktiv", {
          description: "Beenden über das gelbe Band oben oder im Profil.",
        });
      }}
      className="mb-8 flex w-full items-center gap-4 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-left"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground">
        <FlaskConical className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">Schon mal ausprobieren?</span>
        <span className="block text-[14px] text-muted-foreground">
          Die Vorschau spielt die EM mit erfundenen Ergebnissen durch – live, Tabellen, Tipps.
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

/** Die Stadien zum seitlichen Wischen; antippen zeigt ihre Spiele im Spielplan. */
function StadiumRail() {
  const { matches } = useTournament();
  return (
    <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
      {VENUES.map((v) => {
        const games = matches.filter((m) => m.venue.id === v.id).length;
        const host = getNation(v.country);
        return (
          <Link
            key={v.id}
            to="/spielplan"
            search={{ q: v.name }}
            className="flex w-[78%] max-w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-card p-4 hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {host && <Flag flag={host.flag} size="sm" />}
              {v.city}
            </span>
            <span className="mt-2 font-display text-[22px] font-bold uppercase leading-tight">
              {v.name}
            </span>
            <span className="mt-auto flex items-baseline justify-between gap-2 pt-3 text-[13.5px] text-muted-foreground">
              <span className="tabular">{v.capacity.toLocaleString("de-DE")} Plätze</span>
              <span className="font-semibold text-primary">
                {games} {games === 1 ? "Spiel" : "Spiele"}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
