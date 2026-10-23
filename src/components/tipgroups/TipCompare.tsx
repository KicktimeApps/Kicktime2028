import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { defaultPageStart, defaultRoundIndex } from "@/domain/compare";
import { teamDisplay } from "@/domain/labels";
import { isRated, scorePrediction, type BoardRow } from "@/domain/predictions";
import { buildRounds } from "@/domain/rounds";
import { formatDayShort, formatTime } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { TipMember } from "@/services/tipgroups";
import { useTimeZone } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";

/**
 * Tipp-Vergleich wie bei Kicktipp: oben der Spieltag (wie beim Tippen, über
 * mehrere Tage), im Tabellenkopf immer gleich viele Spiele nebeneinander – mit
 * den Pfeilen (oder Wischen) durch die Spiele blättern. Darunter je Mitspieler
 * die Tipps mit Punkten, rechts P = Punkte im Spieltag, G = gesamt.
 * Laufende Spiele zählen mit dem Zwischenstand vorläufig mit (rot = live).
 * Fremde Tipps liefert der Server erst ab Anpfiff.
 */

const WIDE = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function TipCompare({
  members,
  rows,
  isVisible,
  onSelect,
  demo,
}: {
  members: TipMember[];
  /** Gesamttabelle – bestimmt Reihenfolge und G. */
  rows: BoardRow[];
  isVisible: (m: MatchView) => boolean;
  onSelect: (m: TipMember) => void;
  demo: boolean;
}) {
  const { matches } = useTournament();
  const tz = useTimeZone();
  const openMatch = useUi((s) => s.openMatch);
  // Handy 3 Spiele nebeneinander, Desktop 6.
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const size = wide ? 6 : 3;
  const rounds = useMemo(() => buildRounds(matches), [matches]);
  // Gewählter Spieltag/Seite – bleiben stehen, wenn sich Ergebnisse ändern.
  const [picked, setPicked] = useState<{ round: string; start: number | null } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const pickedIndex = picked ? rounds.findIndex((r) => r.key === picked.round) : -1;
  const index = pickedIndex >= 0 ? pickedIndex : defaultRoundIndex(rounds);
  const round = rounds[index];
  if (!round) return null;
  const list = round.matches;
  const rawStart =
    pickedIndex >= 0 && picked?.start != null ? picked.start : defaultPageStart(list, size);
  // Seitenanfang immer auf ein Vielfaches der Seitengröße (z. B. nach Drehen des Handys).
  const start = Math.min(Math.floor(rawStart / size) * size, Math.max(0, list.length - 1));
  const page = list.slice(start, start + size);
  const canBack = start > 0;
  const canNext = start + size < list.length;

  const goRound = (step: number) => {
    const r = rounds[index + step];
    if (r) setPicked({ round: r.key, start: null });
  };
  const goPage = (step: number) => {
    const next = start + step * size;
    if (next >= 0 && next < list.length) setPicked({ round: round.key, start: next });
  };

  const counts = (m: MatchView) => isRated(m, true) && isVisible(m);
  const anyLive = list.some((m) => m.status === "live" && counts(m));
  const cols = `1.5rem minmax(0,1fr) repeat(${size}, var(--tip-col)) 1.75rem 2.25rem`;
  const first = list[0].kickoffUtc;
  const last = list[list.length - 1].kickoffUtc;
  const range =
    formatDayShort(first, tz) === formatDayShort(last, tz)
      ? formatDayShort(first, tz)
      : `${formatDayShort(first, tz)} – ${formatDayShort(last, tz)}`;
  const arrow =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted/50 disabled:text-muted-foreground/30 disabled:hover:bg-transparent";

  return (
    <>
      <section className="mb-3 overflow-hidden rounded-2xl border border-border bg-card [--tip-col:2.9rem] md:[--tip-col:4rem]">
        {/* Spieltag wählen – wie beim Tippen */}
        <div className="flex items-center gap-1 border-b border-border/70 px-1 py-1">
          <button
            type="button"
            onClick={() => goRound(-1)}
            disabled={index === 0}
            aria-label="Vorheriger Spieltag"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center leading-tight">
            <div className="truncate font-display text-[19px] font-bold uppercase">
              {round.label}
            </div>
            <div className="text-[12.5px] text-muted-foreground">{range}</div>
          </div>
          <button
            type="button"
            onClick={() => goRound(1)}
            disabled={index === rounds.length - 1}
            aria-label="Nächster Spieltag"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div
          onTouchStart={(e) => {
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0].clientX - t.x;
            const dy = e.changedTouches[0].clientY - t.y;
            // Waagerecht wischen blättert durch die Spiele (wie die Pfeile).
            if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) goPage(dx < 0 ? 1 : -1);
          }}
        >
          {/* Kopf: Pfeile und die Spiele dieser Seite */}
          <div
            className="grid items-center gap-x-0.5 border-b border-border/70 px-2 py-2"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="col-span-2 flex flex-col items-end pr-1">
              <button
                type="button"
                onClick={() => goPage(-1)}
                disabled={!canBack}
                aria-label="Vorherige Spiele"
                className={arrow}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              </button>
              {list.length > size && (
                <span className="text-[11px] text-muted-foreground tabular">
                  {start + 1}–{start + page.length} von {list.length}
                </span>
              )}
            </div>
            {Array.from({ length: size }, (_, i) => {
              const m = page[i];
              if (!m) return <span key={`leer-${i}`} />;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openMatch(m.id)}
                  aria-label={`${teamDisplay(m.home, m.slotHome).name} gegen ${teamDisplay(m.away, m.slotAway).name}`}
                  className="flex flex-col items-center rounded-lg py-1 text-center leading-tight hover:bg-muted/40"
                >
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    {teamDisplay(m.home, m.slotHome).code ?? "–"}
                  </span>
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    {teamDisplay(m.away, m.slotAway).code ?? "–"}
                  </span>
                  <MatchResult m={m} visible={isVisible(m)} tz={tz} />
                </button>
              );
            })}
            <div className="col-span-2 flex flex-col items-start">
              <button
                type="button"
                onClick={() => goPage(1)}
                disabled={!canNext}
                aria-label="Weitere Spiele"
                className={arrow}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <span className="grid w-full grid-cols-[1.75rem_2.25rem] text-right text-[12px] font-semibold text-muted-foreground">
                <span title="Punkte im Spieltag">P</span>
                <span title="Punkte gesamt">G</span>
              </span>
            </div>
          </div>

          {/* Je Mitspieler eine Zeile, Reihenfolge wie in der Tabelle */}
          <ol className="divide-y divide-border/70">
            {rows.map((r) => {
              const mem = members.find((x) => x.id === r.id);
              if (!mem) return null;
              // P zählt den ganzen Spieltag, nicht nur die sichtbaren Spalten.
              let roundPoints = 0;
              let counted = false;
              for (const m of list) {
                const t = mem.tips[m.id];
                if (t && counts(m)) {
                  counted = true;
                  roundPoints += scorePrediction(t, m.score!, m.stage).points;
                }
              }
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(mem)}
                    className={cn(
                      "grid min-h-[48px] w-full items-center gap-x-0.5 px-2 text-left hover:bg-muted/40",
                      mem.isMe && "bg-primary/8",
                    )}
                    style={{ gridTemplateColumns: cols }}
                  >
                    <span
                      className={cn(
                        "pl-1 text-[14px] font-semibold tabular",
                        r.rank === 1 ? "text-gold" : "text-muted-foreground",
                      )}
                    >
                      {r.rank}.
                    </span>
                    <span className="truncate pl-1 text-[15px] font-semibold">{mem.name}</span>
                    {Array.from({ length: size }, (_, i) => {
                      const m = page[i];
                      if (!m) return <span key={`leer-${i}`} />;
                      return <TipCell key={m.id} m={m} mem={mem} counts={counts(m)} />;
                    })}
                    <span className="text-right text-[15px] font-semibold tabular">
                      {counted ? roundPoints : ""}
                    </span>
                    <span className="pr-1 text-right font-display text-[18px] font-bold tabular">
                      {r.points}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
      <p className="mb-6 px-1 text-[12.5px] text-muted-foreground">
        {demo
          ? "Vorschau: Die Tipps der anderen erscheinen erst ab dem echten Anpfiff."
          : "Die Tipps der anderen erscheinen ab Anpfiff."}{" "}
        Kleine Zahl = Punkte · P = Spieltag · G = gesamt.
        {anyLive && " Rote Punkte sind vorläufig (Spiel läuft)."}
      </p>
    </>
  );
}

function TipCell({ m, mem, counts }: { m: MatchView; mem: TipMember; counts: boolean }) {
  const t = mem.tips[m.id];
  if (!t) {
    // Vor Anpfiff kennt man fremde Tipps nicht – dann bleibt das Feld leer.
    return (
      <span className="text-center text-[15px] text-muted-foreground/50">
        {m.status !== "scheduled" || mem.isMe ? "–" : ""}
      </span>
    );
  }
  const res = counts ? scorePrediction(t, m.score!, m.stage) : null;
  return (
    <span
      className={cn(
        "text-center text-[15px] tabular",
        res && res.points === 0 && "text-muted-foreground/60",
        // Eigener Tipp vor Anpfiff: nur für dich sichtbar
        m.status === "scheduled" && "text-muted-foreground",
      )}
    >
      {t.home}:{t.away}
      {res && res.points > 0 && (
        <sub
          className={cn(
            "ml-px text-[10.5px] font-bold",
            m.status === "live" ? "text-live" : "text-primary",
          )}
        >
          {res.points}
        </sub>
      )}
    </span>
  );
}

function MatchResult({ m, visible, tz }: { m: MatchView; visible: boolean; tz: string }) {
  if (m.status === "scheduled") {
    return (
      <span className="mt-0.5 text-[11.5px] text-muted-foreground tabular">
        {formatDayShort(m.kickoffUtc, tz).slice(0, 2)} {formatTime(m.kickoffUtc, tz)}
      </span>
    );
  }
  if (!visible || !m.score) {
    return (
      <Eye className="mt-1 h-3.5 w-3.5 text-muted-foreground" aria-label="Ergebnis verdeckt" />
    );
  }
  return (
    <span
      className={cn(
        "mt-0.5 text-[14px] font-bold tabular",
        m.status === "live" ? "text-live" : "text-foreground",
      )}
    >
      {m.score.home}:{m.score.away}
    </span>
  );
}
