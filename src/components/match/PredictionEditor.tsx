import { Minus, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { canPredict, RESULT_LABEL, scorePrediction } from "@/domain/predictions";
import type { MatchView } from "@/domain/types";
import { teamDisplay } from "@/domain/labels";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useSpoiler } from "./useSpoiler";
import { selectPredictions, useAppStore } from "@/store/app-store";
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

/**
 * Tipp direkt bearbeiten – jede Änderung wird sofort gespeichert (kein
 * separater Speichern-Knopf mehr wie in 2026). Ab Anpfiff gesperrt.
 */
export function PredictionEditor({ match: m }: { match: MatchView }) {
  const now = useNow();
  const pred = useAppStore((s) => selectPredictions(s)[m.id]);
  const setPrediction = useAppStore((s) => s.setPrediction);
  const clearPrediction = useAppStore((s) => s.clearPrediction);
  const { hidden } = useSpoiler(m);
  const open = canPredict(m, now);
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);

  if (!m.home || !m.away) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Tippen ist möglich, sobald die Paarung feststeht.
      </p>
    );
  }

  // Bei verborgenem Ergebnis keine Wertung – „Volltreffer“ würde es verraten.
  const result =
    pred && m.status === "finished" && m.score && !hidden
      ? scorePrediction(pred, m.score, m.stage)
      : null;
  const set = (home: number, away: number) => {
    haptics.tap();
    if (!pred) toast.success("Tipp gespeichert");
    setPrediction(m.id, Math.max(0, home), Math.max(0, away));
  };

  if (!open && !pred) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Kein Tipp abgegeben – Tippen nur bis Anpfiff.
      </p>
    );
  }

  return (
    <div>
      {open ? (
        <div className="flex items-center justify-center gap-4">
          <Stepper
            label={a.name}
            value={pred?.home ?? null}
            disabled={false}
            onChange={(v) => set(v, pred?.away ?? 0)}
          />
          <span className="font-display text-2xl text-muted-foreground">:</span>
          <Stepper
            label={b.name}
            value={pred?.away ?? null}
            disabled={false}
            onChange={(v) => set(pred?.home ?? 0, v)}
          />
        </div>
      ) : (
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[12px] text-muted-foreground">Dein Tipp</span>
          <span className="font-display text-3xl font-bold tabular">
            {pred!.home}:{pred!.away}
          </span>
        </div>
      )}
      <div className="mt-2 flex min-h-6 items-center justify-between text-[12px] text-muted-foreground">
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
          <span>{pred ? "Gespeichert – änderbar bis Anpfiff" : "Noch kein Tipp"}</span>
        ) : pred ? (
          <span>Tipp abgegeben · wird nach Spielende gewertet</span>
        ) : null}
        {pred && open && (
          <button
            type="button"
            onClick={() => {
              const before = pred;
              clearPrediction(m.id);
              toast("Tipp gelöscht", {
                duration: 6000,
                description: before
                  ? `${a.name} ${before.home}:${before.away} ${b.name}`
                  : undefined,
                action: before
                  ? {
                      label: "Rückgängig",
                      onClick: () => setPrediction(m.id, before.home, before.away),
                    }
                  : undefined,
              });
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> Löschen
          </button>
        )}
      </div>
    </div>
  );
}
