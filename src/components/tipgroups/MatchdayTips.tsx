import { ChevronLeft, ChevronRight, Eye, Loader2, Lock, Save, Target } from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSpoiler } from "@/components/match/useSpoiler";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { canPredict, scorePrediction, type Prediction } from "@/domain/predictions";
import { formatDayShort, formatTime } from "@/domain/time";
import { buildRounds, type Round } from "@/domain/rounds";
import type { MatchView } from "@/domain/types";
import { usePrefs } from "@/hooks/usePrefs";
import { haptics } from "@/lib/haptics";
import { saveTip, type TipContext } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { TipError } from "@/services/tipgroups";
import { useNow } from "@/store/match-store";
import { useUi } from "@/store/ui-store";

/**
 * Tippen nach Spieltagen – wie bei Kicktipp: immer ein Spieltag als
 * kompakte Liste, Ergebnis direkt in die Felder schreiben, alle Änderungen
 * mit einem Knopf speichern. Mit den Pfeilen zum nächsten Spieltag.
 */

/** Entwurf eines Spiels: leere Felder = "". */
type Draft = { home: string; away: string };

/** Startet beim ersten Spieltag mit offenen Spielen, sonst beim letzten. */
function initialRound(rounds: Round[], now: number): number {
  const i = rounds.findIndex((r) => r.matches.some((m) => canPredict(m, now)));
  if (i >= 0) return i;
  let played = 0;
  rounds.forEach((r, j) => {
    if (r.matches.some((m) => m.status !== "scheduled")) played = j;
  });
  return played;
}

const toDraft = (t?: { home: number; away: number }): Draft =>
  t ? { home: String(t.home), away: String(t.away) } : { home: "", away: "" };

export function MatchdayTips({
  ctx,
  matches,
  tips,
}: {
  ctx: TipContext;
  matches: MatchView[];
  tips: Record<string, Prediction>;
}) {
  const now = useNow();
  const rounds = useMemo(() => buildRounds(matches), [matches]);
  const [idx, setIdx] = useState(() => initialRound(rounds, now));
  // Entwürfe über alle Spieltage – Blättern verliert nichts.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const round = rounds[Math.min(idx, rounds.length - 1)];

  const draftOf = (m: MatchView) => drafts[m.id] ?? toDraft(tips[m.id]);
  const changed = Object.entries(drafts).filter(([id, d]) => {
    const t = tips[id];
    return d.home !== (t ? String(t.home) : "") || d.away !== (t ? String(t.away) : "");
  });
  // Ungespeicherte Tipps nicht stillschweigend verlieren (Seitenwechsel,
  // Zurück-Geste, Neuladen).
  const unsaved = useRef(0);
  const blocker = useBlocker({
    shouldBlockFn: () => unsaved.current > 0,
    enableBeforeUnload: () => unsaved.current > 0,
    withResolver: true,
  });
  const isIncomplete = (d: Draft) => (d.home === "") !== (d.away === "");
  const incomplete = changed.filter(([, d]) => isIncomplete(d));
  const ready = changed.filter(([, d]) => !isIncomplete(d));
  unsaved.current = changed.length;

  const set = (m: MatchView, side: "home" | "away", raw: string) => {
    const v = raw.replace(/\D/g, "").slice(-2);
    const val = v === "" ? "" : String(Math.min(30, Number(v)));
    setDrafts((ds) => ({ ...ds, [m.id]: { ...(ds[m.id] ?? toDraft(tips[m.id])), [side]: val } }));
    // Nach einer Ziffer automatisch ins nächste Feld – wie bei Kicktipp.
    if (val !== "") {
      const open = round.matches.filter((x) => canPredict(x, now));
      const i = open.findIndex((x) => x.id === m.id);
      const next = side === "home" ? `${m.id}:away` : open[i + 1] ? `${open[i + 1].id}:home` : null;
      if (next) inputs.current.get(next)?.focus();
      else inputs.current.get(`${m.id}:${side}`)?.blur();
    }
  };

  const saveAll = async (): Promise<boolean> => {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const [id, d] of ready) {
      try {
        await saveTip(
          ctx,
          id,
          d.home === "" ? null : { home: Number(d.home), away: Number(d.away) },
        );
        ok++;
      } catch (err) {
        failed.push(
          err instanceof TipError ? err.message : "Tipp konnte nicht gespeichert werden.",
        );
      }
    }
    setDrafts((ds) => {
      const next = { ...ds };
      for (const [id] of ready) delete next[id];
      return next;
    });
    setBusy(false);
    if (ok) {
      haptics.success();
      toast.success(`${ok} ${ok === 1 ? "Tipp" : "Tipps"} gespeichert`, {
        description: ctx.kind === "solo" ? undefined : `für „${ctx.label}“`,
      });
    }
    if (failed.length) toast.error(failed[0]);
    else if (incomplete.length)
      toast(
        `${incomplete.length} ${incomplete.length === 1 ? "Tipp ist" : "Tipps sind"} noch unvollständig`,
        {
          description: "Bitte bei jedem Spiel beide Felder ausfüllen.",
        },
      );
    unsaved.current = incomplete.length;
    return failed.length === 0 && incomplete.length === 0;
  };

  if (!round) return null;
  const openHere = round.matches.filter((m) => canPredict(m, now));
  const tippedHere = round.matches.filter((m) => tips[m.id]).length;
  const pointsHere = round.matches.reduce((sum, m) => {
    const t = tips[m.id];
    return t && m.status === "finished" && m.score
      ? sum + scorePrediction(t, m.score, m.stage).points
      : sum;
  }, 0);
  const first = round.matches[0];
  const last = round.matches[round.matches.length - 1];

  return (
    <section className="mb-7">
      {/* Wofür gilt der Tipp? Dezent, aber direkt über den Spielen. */}
      {ctx.kind === "group" && (
        <div className="mb-2 flex justify-center">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-[13px] font-semibold text-primary">
            <Target className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Tipps für „{ctx.label}“</span>
          </span>
        </div>
      )}
      {/* Spieltag wählen */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Vorheriger Spieltag"
          disabled={idx === 0}
          onClick={() => setIdx((i) => i - 1)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="font-display text-[22px] font-bold uppercase leading-none">
            {round.label}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            <DateRange from={first} to={last} /> · {tippedHere} von {round.matches.length} getippt
          </p>
        </div>
        <button
          type="button"
          aria-label="Nächster Spieltag"
          disabled={idx >= rounds.length - 1}
          onClick={() => setIdx((i) => i + 1)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Fortschritt über alle Spieltage */}
      <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
        {rounds.map((r, i) => (
          <button
            key={r.key}
            type="button"
            tabIndex={-1}
            onClick={() => setIdx(i)}
            className={cn(
              "h-2 rounded-full transition-all",
              i === idx ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>

      {openHere.length === 0 && (
        <p className="mb-3 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {round.matches.some((m) => !m.home || !m.away)
            ? "Paarungen stehen noch nicht fest."
            : `Alle Spiele angepfiffen${pointsHere ? ` · ${pointsHere} Punkte` : ""}.`}
        </p>
      )}

      <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        {round.matches.map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            now={now}
            draft={draftOf(m)}
            saved={tips[m.id]}
            dirty={!!drafts[m.id] && changed.some(([id]) => id === m.id)}
            onChange={(side, v) => set(m, side, v)}
            register={(side, el) => {
              const k = `${m.id}:${side}`;
              if (el) inputs.current.set(k, el);
              else inputs.current.delete(k);
            }}
          />
        ))}
      </ul>

      {/* Ein Knopf für alle Änderungen – bleibt über der Leiste sichtbar */}
      {changed.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mt-3 md:bottom-4">
          {incomplete.length > 0 && (
            <p className="mb-2 rounded-xl bg-gold/15 px-3 py-1.5 text-center text-[13px] font-medium text-gold backdrop-blur">
              {incomplete.length === 1
                ? "1 Tipp unvollständig – bitte beide Felder ausfüllen"
                : `${incomplete.length} Tipps unvollständig – bitte beide Felder ausfüllen`}
            </p>
          )}
          <button
            type="button"
            disabled={busy || ready.length === 0}
            onClick={saveAll}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3.5 text-[16px] font-semibold text-primary-foreground shadow-lg shadow-black/20 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="truncate">
              {ready.length <= 1 ? "Tipp" : `${ready.length} Tipps`}
              {ctx.kind === "group" ? ` für „${ctx.label}“` : ""} speichern
            </span>
          </button>
        </div>
      )}
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tipps noch nicht gespeichert</AlertDialogTitle>
            <AlertDialogDescription>
              {changed.length === 1
                ? "Du hast einen Tipp eingegeben, aber noch nicht gespeichert."
                : `Du hast ${changed.length} Tipps eingegeben, aber noch nicht gespeichert.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Zurück</AlertDialogCancel>
            <AlertDialogAction
              className="bg-muted text-foreground hover:bg-muted/80"
              onClick={() => {
                unsaved.current = 0;
                blocker.proceed?.();
              }}
            >
              Verwerfen
            </AlertDialogAction>
            {ready.length > 0 && (
              <AlertDialogAction
                onClick={async () => {
                  if (await saveAll()) blocker.proceed?.();
                  else blocker.reset?.();
                }}
              >
                Speichern
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DateRange({ from, to }: { from: MatchView; to: MatchView }) {
  const tz = usePrefs().timeZone;
  const a = formatDayShort(from.kickoffUtc, tz);
  const b = formatDayShort(to.kickoffUtc, tz);
  return <>{a === b ? a : `${a} – ${b}`}</>;
}

function MatchRow({
  m,
  now,
  draft,
  saved,
  dirty,
  onChange,
  register,
}: {
  m: MatchView;
  now: number;
  draft: Draft;
  saved?: Prediction;
  dirty: boolean;
  onChange: (side: "home" | "away", v: string) => void;
  register: (side: "home" | "away", el: HTMLInputElement | null) => void;
}) {
  const tz = usePrefs().timeZone;
  const openMatch = useUi((s) => s.openMatch);
  const { hidden, reveal } = useSpoiler(m);
  const open = canPredict(m, now);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const finished = m.status === "finished" && !!m.score;
  const result = finished && saved && !hidden ? scorePrediction(saved, m.score!, m.stage) : null;

  const box = (side: "home" | "away") => (
    <input
      ref={(el) => register(side, el)}
      value={draft[side]}
      onChange={(e) => onChange(side, e.target.value)}
      onFocus={(e) => e.target.select()}
      disabled={!open}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={`Tore ${side === "home" ? a.name : b.name}`}
      placeholder={open ? "–" : ""}
      className={cn(
        "h-11 w-12 rounded-xl border text-center font-display text-[22px] font-bold tabular outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30",
        open
          ? dirty
            ? "border-gold bg-gold/10"
            : "border-border bg-background"
          : "border-transparent bg-muted/60 text-muted-foreground",
      )}
    />
  );

  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <button
        type="button"
        onClick={() => openMatch(m.id)}
        className="min-w-0 flex-1 text-left"
        aria-label={`${a.name} gegen ${b.name}, Details öffnen`}
      >
        <span className="block text-[12px] text-muted-foreground tabular">
          {formatDayShort(m.kickoffUtc, tz)} · {formatTime(m.kickoffUtc, tz)}
          {m.group && ` · Gr. ${m.group}`}
          {m.status === "live" && <span className="font-semibold text-live"> · läuft</span>}
        </span>
        {[a, b].map((t, i) => (
          <span key={i} className="mt-1 flex h-6 items-center gap-2">
            <Flag flag={t.flag} size="sm" />
            <span
              className={cn(
                "truncate text-[15px]",
                t.placeholder ? "text-muted-foreground" : "font-semibold",
              )}
            >
              {t.name}
            </span>
          </span>
        ))}
      </button>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          {box("home")}
          <span className="font-display text-[18px] text-muted-foreground">:</span>
          {box("away")}
        </div>
        {finished &&
          (hidden ? (
            <button
              type="button"
              onClick={reveal}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground"
            >
              <Eye className="h-3.5 w-3.5" /> Ergebnis
            </button>
          ) : (
            <span className="text-[12px] text-muted-foreground tabular">
              Erg.{" "}
              <strong className="text-foreground">
                {m.score!.home}:{m.score!.away}
              </strong>
              {result && (
                <strong className={cn("ml-1.5", result.points ? "text-primary" : "")}>
                  +{result.points}
                </strong>
              )}
            </span>
          ))}
        {!open && !saved && !finished && m.home && m.away && (
          <span className="text-[11.5px] text-muted-foreground">kein Tipp</span>
        )}
      </div>
    </li>
  );
}
