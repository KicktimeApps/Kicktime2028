import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { defaultDayIndex, matchDays } from "@/domain/compare";
import { teamDisplay } from "@/domain/labels";
import { scorePrediction, type BoardRow } from "@/domain/predictions";
import { formatDayLong, formatTime, relativeDay } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { TipMember } from "@/services/tipgroups";
import { useTimeZone } from "@/store/app-store";
import { useNowMinute, useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";

/**
 * Tipp-Vergleich wie bei Kicktipp: ein Spieltag, oben die Spiele, darunter
 * je Mitspieler die Tipps mit Punkten. Bewusst schlicht – ein Kasten, ein Tag,
 * höchstens vier Spalten. Fremde Tipps liefert der Server erst ab Anpfiff.
 */
export function TipCompare({
  members,
  rows,
  isVisible,
  onSelect,
  demo,
}: {
  members: TipMember[];
  /** Gesamttabelle – bestimmt die Reihenfolge. */
  rows: BoardRow[];
  isVisible: (m: MatchView) => boolean;
  onSelect: (m: TipMember) => void;
  demo: boolean;
}) {
  const { matches } = useTournament();
  const tz = useTimeZone();
  const now = useNowMinute();
  const openMatch = useUi((s) => s.openMatch);
  const days = useMemo(() => matchDays(matches, tz), [matches, tz]);
  // Gewählter Tag als Schlüssel – bleibt stehen, wenn sich Ergebnisse ändern.
  const [picked, setPicked] = useState<string | null>(null);
  const pickedIndex = picked ? days.findIndex((d) => d.key === picked) : -1;
  const index = pickedIndex >= 0 ? pickedIndex : defaultDayIndex(days);
  const day = days[index];
  if (!day) return null;

  const go = (step: number) => setPicked(days[index + step]?.key ?? null);
  const first = day.matches[0].kickoffUtc;
  const rel = relativeDay(first, now, tz);
  const label = formatDayLong(first, tz);
  const counts = (m: MatchView) => m.status === "finished" && !!m.score && isVisible(m);
  // An Tagen mit vier Spielen werden die Spalten schmaler, damit Namen lesbar bleiben.
  const narrow = day.matches.length > 3;
  const cols = `1.5rem minmax(0,1fr) repeat(${day.matches.length}, var(--tip-col)) 2rem`;

  return (
    <>
      <section
        className={cn(
          "mb-3 overflow-hidden rounded-2xl border border-border bg-card md:[--tip-col:4.75rem]",
          narrow ? "[--tip-col:2.6rem]" : "[--tip-col:3.25rem]",
        )}
      >
        <div className="flex items-center gap-1 border-b border-border/70 px-1">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Vorheriger Spieltag"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">
            {rel ? `${rel} · ${label}` : label}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === days.length - 1}
            aria-label="Nächster Spieltag"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Kopf: die Spiele des Tages */}
        <div
          className="grid items-end gap-x-1 border-b border-border/70 px-3 pb-2 pt-2.5"
          style={{ gridTemplateColumns: cols }}
        >
          <span />
          <span />
          {day.matches.map((m) => (
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
          ))}
          <span className="pb-1 text-right text-[12px] font-semibold text-muted-foreground">
            Pkt
          </span>
        </div>

        {/* Je Mitspieler eine Zeile, Reihenfolge wie in der Tabelle */}
        <ol className="divide-y divide-border/70">
          {rows.map((r) => {
            const mem = members.find((x) => x.id === r.id);
            if (!mem) return null;
            let dayPoints = 0;
            let counted = false;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(mem)}
                  className={cn(
                    "grid min-h-[48px] w-full items-center gap-x-1 px-3 text-left hover:bg-muted/40",
                    mem.isMe && "bg-primary/8",
                  )}
                  style={{ gridTemplateColumns: cols }}
                >
                  <span
                    className={cn(
                      "text-[14px] font-semibold tabular",
                      r.rank === 1 ? "text-gold" : "text-muted-foreground",
                    )}
                  >
                    {r.rank}.
                  </span>
                  <span className="truncate text-[15px] font-semibold">{mem.name}</span>
                  {day.matches.map((m) => {
                    const t = mem.tips[m.id];
                    if (!t) {
                      // Vor Anpfiff kennt man fremde Tipps nicht – dann bleibt das Feld leer.
                      return (
                        <span
                          key={m.id}
                          className={cn(
                            "text-center text-muted-foreground/50",
                            narrow ? "text-[14px]" : "text-[15px]",
                          )}
                        >
                          {m.status !== "scheduled" || mem.isMe ? "–" : ""}
                        </span>
                      );
                    }
                    const res = counts(m) ? scorePrediction(t, m.score!, m.stage) : null;
                    if (res) {
                      counted = true;
                      dayPoints += res.points;
                    }
                    return (
                      <span
                        key={m.id}
                        className={cn(
                          "text-center tabular",
                          narrow ? "text-[14px]" : "text-[15px]",
                          res && res.points === 0 && "text-muted-foreground/60",
                          // Eigener Tipp vor Anpfiff: nur für dich sichtbar
                          m.status === "scheduled" && "text-muted-foreground",
                        )}
                      >
                        {t.home}:{t.away}
                        {res && res.points > 0 && (
                          <sub className="ml-px text-[10.5px] font-bold text-primary">
                            {res.points}
                          </sub>
                        )}
                      </span>
                    );
                  })}
                  <span className="text-right font-display text-[18px] font-bold tabular">
                    {counted ? dayPoints : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="mb-6 px-1 text-[12.5px] text-muted-foreground">
        {demo
          ? "Vorschau: Die Tipps der anderen erscheinen erst ab dem echten Anpfiff."
          : "Die Tipps der anderen erscheinen ab Anpfiff."}{" "}
        Kleine Zahl = Punkte.
      </p>
    </>
  );
}

function MatchResult({ m, visible, tz }: { m: MatchView; visible: boolean; tz: string }) {
  if (m.status === "scheduled") {
    return (
      <span className="mt-0.5 text-[12px] text-muted-foreground tabular">
        {formatTime(m.kickoffUtc, tz)}
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
