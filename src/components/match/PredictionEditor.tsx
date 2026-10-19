import { Check, Loader2, Minus, Plus, Save, Target, Trash2, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canPredict, RESULT_LABEL, scorePrediction } from "@/domain/predictions";
import type { MatchView } from "@/domain/types";
import { teamDisplay } from "@/domain/labels";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useSpoiler } from "./useSpoiler";
import {
  saveTip,
  tipsOf,
  useContextTips,
  useTipContext,
  useTipContexts,
  type TipContext,
} from "@/lib/tips";
import { TipError } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useNow } from "@/store/match-store";

function Stepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled: boolean;
  label: string;
}) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <button
        type="button"
        disabled={disabled || v === 0 || value === null}
        onClick={() => onChange(v - 1)}
        aria-label={`${label} weniger`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={cn(
          "w-8 text-center font-display text-3xl font-bold tabular",
          value === null && "text-muted-foreground/50",
        )}
      >
        {value ?? "?"}
      </span>
      <button
        type="button"
        disabled={disabled || v >= 15}
        onClick={() => onChange(value === null ? 0 : v + 1)}
        aria-label={`${label} mehr`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Zeigt, wofür getippt wird – bei mehreren Runden zum Umschalten. */
function TipContextBar({ className, matchId }: { className?: string; matchId?: string }) {
  const contexts = useTipContexts();
  const tipped = useAppStore((s) =>
    matchId ? contexts.map((c) => !!tipsOf(s, c)[matchId]).join() : "",
  ).split(",");
  const ctx = useTipContext();
  const setTipContext = useAppStore((s) => s.setTipContext);
  if (contexts.length <= 1) {
    return (
      <div className={cn("text-[13px] text-muted-foreground", className)}>
        {ctx.kind === "solo" ? (
          <>
            <User className="mr-1 inline h-3.5 w-3.5" />
            Du tippst <strong className="text-foreground">allein</strong>
          </>
        ) : (
          <>
            <Users className="mr-1 inline h-3.5 w-3.5" />
            Tipp für <strong className="text-foreground">{ctx.label}</strong>
          </>
        )}
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="mb-1.5 text-[13px] text-muted-foreground">
        <Users className="mr-1 inline h-3.5 w-3.5" /> Jede Runde wird einzeln getippt. Du tippst
        für:
      </div>
      <div role="tablist" aria-label="Tipprunde wählen" className="flex flex-wrap gap-1.5">
        {contexts.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === ctx.id}
            onClick={() => setTipContext(c.id)}
            className={cn(
              "h-10 rounded-full border px-3.5 text-[14px] font-semibold",
              c.id === ctx.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card",
            )}
          >
            {c.label}
            {tipped[i] === "true" && (
              <Check className="ml-1 inline h-3.5 w-3.5" aria-label="getippt" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Tipp bearbeiten: Die Knöpfe ändern einen Entwurf, erst „Tipp speichern“
 * speichert – allein auf dem Gerät, in einer Runde auf dem Server. Ab
 * Anpfiff gesperrt.
 */
export function PredictionEditor({
  match: m,
  showContext = true,
  context,
}: {
  match: MatchView;
  showContext?: boolean;
  /** Fester Kontext (z. B. auf der Seite einer Runde); sonst der ausgewählte. */
  context?: TipContext;
}) {
  const now = useNow();
  const current = useTipContext();
  const ctx = context ?? current;
  const saved = useContextTips(ctx)[m.id];
  const { hidden } = useSpoiler(m);
  const open = canPredict(m, now);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const [draft, setDraft] = useState<{ home: number; away: number } | null>(
    saved ? { home: saved.home, away: saved.away } : null,
  );
  const [busy, setBusy] = useState(false);
  // Gespeicherten Stand übernehmen, wenn er sich ändert (z. B. andere Runde gewählt).
  useEffect(() => {
    setDraft(saved ? { home: saved.home, away: saved.away } : null);
  }, [saved?.home, saved?.away, ctx.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m.home || !m.away) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Tippen ist möglich, sobald die Paarung feststeht.
      </p>
    );
  }

  const dirty = !!draft && (!saved || saved.home !== draft.home || saved.away !== draft.away);
  // Bei verborgenem Ergebnis keine Wertung – „Volltreffer“ würde es verraten.
  const result =
    saved && m.status === "finished" && m.score && !hidden
      ? scorePrediction(saved, m.score, m.stage)
      : null;
  const where = ctx.kind === "solo" ? "" : ` für „${ctx.label}“`;

  const persist = async (tip: { home: number; away: number } | null) => {
    setBusy(true);
    try {
      await saveTip(ctx, m.id, tip);
      haptics.success();
      return true;
    } catch (err) {
      toast.error(err instanceof TipError ? err.message : "Tipp konnte nicht gespeichert werden.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!open && !saved) {
    return (
      <div>
        {showContext && <TipContextBar className="mb-2" />}
        <p className="text-[13px] text-muted-foreground">
          Kein Tipp abgegeben – Tippen nur bis Anpfiff.
        </p>
      </div>
    );
  }

  return (
    <div>
      {showContext && <TipContextBar className="mb-3" matchId={m.id} />}
      {open ? (
        <div className="flex items-center justify-center gap-4">
          <Stepper
            label={a.name}
            value={draft?.home ?? null}
            disabled={busy}
            onChange={(v) => setDraft({ home: Math.max(0, v), away: draft?.away ?? 0 })}
          />
          <span className="font-display text-2xl text-muted-foreground">:</span>
          <Stepper
            label={b.name}
            value={draft?.away ?? null}
            disabled={busy}
            onChange={(v) => setDraft({ home: draft?.home ?? 0, away: Math.max(0, v) })}
          />
        </div>
      ) : (
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[12px] text-muted-foreground">Dein Tipp</span>
          <span className="font-display text-3xl font-bold tabular">
            {saved!.home}:{saved!.away}
          </span>
        </div>
      )}

      {open && dirty && (
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={async () => {
            if (draft && (await persist(draft)))
              toast.success(`Tipp gespeichert${where}`, {
                description: `${a.name} ${draft.home}:${draft.away} ${b.name}`,
              });
          }}
          className={cn(
            "mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition-colors",
            dirty
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-muted-foreground",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : dirty ? (
            <Save className="h-4 w-4" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {dirty ? "Tipp speichern" : "Gespeichert"}
        </button>
      )}

      {(result || saved || dirty) && (
        <div className="mt-2 flex min-h-6 items-center justify-between text-[12.5px] text-muted-foreground">
          {result ? (
            <span
              className={cn(
                "font-semibold",
                result.points > 0 ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Target className="mr-1 inline h-3.5 w-3.5" />
              {RESULT_LABEL[result.result]} · +{result.points} Punkte
            </span>
          ) : open ? (
            dirty ? (
              <span className="font-semibold text-gold">Noch nicht gespeichert</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-primary" /> Gespeichert · änderbar bis Anpfiff
              </span>
            )
          ) : saved ? (
            <span>Tipp abgegeben · wird nach Spielende gewertet</span>
          ) : null}
          {saved && open && !dirty && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const before = { home: saved.home, away: saved.away };
                if (!(await persist(null))) return;
                toast("Tipp gelöscht", {
                  duration: 6000,
                  description: `${a.name} ${before.home}:${before.away} ${b.name}`,
                  action: { label: "Rückgängig", onClick: () => void persist(before) },
                });
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
