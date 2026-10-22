import {
  CalendarPlus,
  ChevronDown,
  Info,
  MapPin,
  Plane,
  Play,
  Share2,
  Target,
  ThermometerSun,
  Train,
  Tv,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LiveDot } from "@/components/common/LiveDot";
import { Flag } from "@/components/team/Flag";
import { GroupTableCard } from "@/components/tournament/GroupTableCard";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { hostHint, teamDisplay } from "@/domain/labels";
import { fitFor, formatCountdownShort, formatDate, formatTime } from "@/domain/time";
import { usePrefs } from "@/hooks/usePrefs";
import { downloadIcs } from "@/lib/calendar";
import { shareMatch } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { useMatch, useNow, useTournament } from "@/store/match-store";
import { useAppStore } from "@/store/app-store";
import { useUi } from "@/store/ui-store";
import { STAGE_LABEL } from "@/tournament/config";
import { BROADCASTER_URLS, broadcastersOf, getTvInfo } from "@/tournament/tv";
import { COUNTRY_LABEL } from "@/tournament/venues";
import { MatchActions } from "./MatchActions";
import { phaseLabel } from "./phase";
import { ScoreDigit } from "./GoalScore";
import { PredictionEditor } from "./PredictionEditor";
import { useSpoiler } from "./useSpoiler";

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function MatchSheet() {
  const id = useUi((s) => s.matchId);
  const close = useUi((s) => s.closeMatch);
  const m = useMatch(id);
  // Letzten Inhalt während der Schließ-Animation stehen lassen
  const [last, setLast] = useState(m);
  if (m && m !== last) setLast(m);
  const match = m ?? last;
  return (
    <Drawer open={!!id && !!m} onOpenChange={(v) => !v && close()} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl border-border bg-background">
        {match && <SheetBody matchId={match.id} />}
      </DrawerContent>
    </Drawer>
  );
}

function SheetBody({ matchId }: { matchId: string }) {
  const m = useMatch(matchId)!;
  const now = useNow();
  const prefs = usePrefs();
  const tz = prefs.timeZone;
  const tournament = useTournament();
  const openTeam = useUi((s) => s.openTeam);
  const { hidden, reveal } = useSpoiler(m);
  // Tabelle auch vor Anpfiff verbergen – sie verrät die Ergebnisse der Vorrunde.
  const spoilerProtection = useAppStore((s) => s.spoilerProtection);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const tv = getTvInfo(m);
  const fit = fitFor(m.kickoffUtc, tz, prefs.availability);
  const table = useMemo(
    () => (m.group ? tournament.tables.find((t) => t.group === m.group) : undefined),
    [tournament, m.group],
  );
  const ukTime = formatTime(m.kickoffUtc, m.venue.timeZone);
  const myTime = formatTime(m.kickoffUtc, tz);
  const live = m.status === "live";

  const team = (t: typeof a, slot: string) => (
    <button
      type="button"
      disabled={t.placeholder}
      onClick={() => t.code && openTeam(t.code)}
      className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center disabled:cursor-default"
    >
      <Flag flag={t.flag} size="xl" />
      <span
        className={cn(
          "line-clamp-2 text-[15px] font-semibold leading-tight",
          t.placeholder && "text-muted-foreground",
        )}
      >
        {t.name}
      </span>
      {t.placeholder && hostHint(slot) && (
        <span className="text-[11px] text-muted-foreground">{hostHint(slot)}</span>
      )}
    </button>
  );

  return (
    <div className="overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {/* Kopf */}
      <div className="pt-3 text-center">
        <DrawerTitle className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">
          {m.stage === "group"
            ? `Gruppe ${m.group} · ${m.matchday}. Spieltag`
            : STAGE_LABEL[m.stage]}{" "}
          · Spiel {m.number}
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-[13px] text-muted-foreground">
          {formatDate(m.kickoffUtc, tz)} · {m.venue.city}
        </DrawerDescription>
      </div>

      {/* Anzeigetafel */}
      <div className="mt-5 flex items-start gap-3">
        {team(a, m.slotHome)}
        <div className="flex w-28 shrink-0 flex-col items-center pt-2">
          {m.status === "scheduled" ? (
            <>
              <div className="font-display text-4xl font-bold leading-none tabular">{myTime}</div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">
                {formatCountdownShort(Date.parse(m.kickoffUtc), now)}
              </div>
            </>
          ) : m.score ? (
            <button
              type="button"
              onClick={hidden ? reveal : undefined}
              className="flex flex-col items-center"
            >
              <div
                className={cn(
                  "font-display text-5xl font-bold leading-none tabular",
                  live && "text-live",
                  hidden && "select-none blur-md",
                )}
              >
                <ScoreDigit value={m.score.home} />:<ScoreDigit value={m.score.away} />
              </div>
              {m.penalties && !hidden && (
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {m.penalties.home}:{m.penalties.away} i. E.
                </div>
              )}
              {hidden && (
                <span className="mt-2 rounded-full bg-elevated px-2.5 py-1 text-[11px] font-semibold ring-1 ring-border">
                  Ergebnis zeigen
                </span>
              )}
            </button>
          ) : (
            <div className="font-display text-4xl font-bold leading-none text-muted-foreground">
              –:–
            </div>
          )}
          {live && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-live">
              <LiveDot /> {phaseLabel(m)}
            </span>
          )}
          {m.status === "finished" && !m.score && (
            <span className="mt-2 text-[11px] text-muted-foreground">Ergebnis folgt</span>
          )}
        </div>
        {team(b, m.slotAway)}
      </div>

      {/* Schnellinfo als eine leise Zeile */}
      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        {[
          m.status === "scheduled" &&
            (fit === "full"
              ? "✓ Passt in deine Zeit"
              : fit === "partial"
                ? "Teilweise in deiner Zeit"
                : "Außerhalb deiner Zeit"),
          !m.kickoffConfirmed && "Uhrzeit vorläufig",
          tz !== m.venue.timeZone && `Ortszeit ${ukTime}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="mt-3 flex items-center justify-center gap-1">
        <MatchActions match={m} />
        <button
          type="button"
          onClick={() => {
            downloadIcs([m], `kicktime-spiel-${m.number}.ics`);
            toast.success("Kalendereintrag erstellt");
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarPlus className="h-4 w-4" /> Kalender
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const how = await shareMatch(m, tz, hidden);
              if (how === "downloaded") toast.success("Bild gespeichert");
            } catch {
              toast.error("Teilen nicht möglich");
            }
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Share2 className="h-4 w-4" /> Teilen
        </button>
      </div>

      <div className="mt-5 space-y-3">
        <TvBlock tv={tv} />

        <Block icon={<Target />} title="Dein Tipp">
          <PredictionEditor match={m} />
        </Block>

        {table && (
          <GroupTableCard
            table={table}
            highlight={[m.home, m.away].filter((c): c is string => !!c)}
            hideScores={spoilerProtection}
            compact
          />
        )}

        <details className="group rounded-2xl border border-border bg-card px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{m.venue.name}</span>
              <span className="block text-[13px] text-muted-foreground">
                {m.venue.city}, {COUNTRY_LABEL[m.venue.country]}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-3 grid gap-2 border-t border-border/60 pt-3 text-[13px]">
            {m.venue.uefaName !== m.venue.name && (
              <div className="text-muted-foreground">Bei der EM: „{m.venue.uefaName}“</div>
            )}
            <div className="flex gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <dd>{m.venue.capacity.toLocaleString("de-DE")} Plätze</dd>
            </div>
            <div className="flex gap-2">
              <Train className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <dd>{m.venue.transit}</dd>
            </div>
            <div className="flex gap-2">
              <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <dd>{m.venue.airport}</dd>
            </div>
            <div className="flex gap-2">
              <ThermometerSun className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <dd>{m.venue.climate}</dd>
            </div>
          </dl>
        </details>

        {!m.kickoffConfirmed && (
          <p className="flex gap-2 rounded-xl bg-subtle px-3 py-2.5 text-[12.5px] text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Datum und Spielort stehen fest. Die genaue Anstoßzeit legt die UEFA nach der Auslosung
            fest – KickTime aktualisiert sie automatisch.
          </p>
        )}
      </div>
    </div>
  );
}

function TvBlock({ tv }: { tv: ReturnType<typeof getTvInfo> }) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
      <Tv className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="mr-auto text-[14px] font-semibold">Im TV</span>
      {broadcastersOf(tv).map((name) => (
        <a
          key={name}
          href={BROADCASTER_URLS[name]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-subtle px-3.5 text-[14px] font-semibold hover:border-primary/50"
        >
          <Play className="h-3.5 w-3.5 fill-current text-primary" /> {name}
        </a>
      ))}
    </section>
  );
}
