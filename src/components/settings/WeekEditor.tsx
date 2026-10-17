import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { DAY_NAMES, formatHour, type DayWindow, type WeekAvailability } from "@/domain/time";
import { cn } from "@/lib/utils";
import { PRESETS, presetMatches, useFitCount } from "./presets";

const MIN = 6; // 06:00
const MAX = 28; // 04:00 Folgetag

function DayRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DayWindow;
  onChange: (w: DayWindow) => void;
}) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[13px] font-semibold tabular",
              value.off ? "text-muted-foreground" : "text-primary",
            )}
          >
            {value.off
              ? "keine Zeit"
              : `${formatHour(value.start)} – ${formatHour(value.end)}${value.end > 24 ? " ⁺¹" : ""}`}
          </span>
          <Switch
            checked={!value.off}
            onCheckedChange={(on) => onChange({ ...value, off: !on })}
            aria-label={`${label}: Zeit vorhanden`}
          />
        </div>
      </div>
      {!value.off && (
        <Slider
          min={MIN}
          max={MAX}
          step={0.5}
          minStepsBetweenThumbs={2}
          value={[Math.max(MIN, value.start), Math.min(MAX, value.end)]}
          onValueChange={([start, end]) => onChange({ start, end })}
          aria-label={`${label} Zeitfenster`}
        />
      )}
    </div>
  );
}

/**
 * Editor für die verfügbare Zeit: zwei Gruppen (Werktage/Wochenende) oder
 * auf Wunsch jeder Tag einzeln.
 */
export function WeekEditor({
  value,
  onChange,
  timeZone,
}: {
  value: WeekAvailability;
  onChange: (w: WeekAvailability) => void;
  timeZone: string;
}) {
  const uniform =
    value.slice(0, 5).every((d) => JSON.stringify(d) === JSON.stringify(value[0])) &&
    JSON.stringify(value[5]) === JSON.stringify(value[6]);
  const [perDay, setPerDay] = useState(!uniform);
  const preset = presetMatches(value);
  const fit = useFitCount(value, timeZone);

  const setRange = (from: number, to: number, w: DayWindow) =>
    onChange(value.map((d, i) => (i >= from && i <= to ? w : d)));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onChange(p.week);
              setPerDay(false);
            }}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition-colors",
              preset === p.id
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-muted-foreground/40",
            )}
          >
            <div className={cn("text-[14px] font-semibold", preset === p.id && "text-primary")}>
              {p.label}
            </div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{p.hint}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-1">
        {perDay ? (
          <div className="divide-y divide-border/70">
            {value.map((d, i) => (
              <DayRow key={i} label={DAY_NAMES[i]} value={d} onChange={(w) => setRange(i, i, w)} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            <DayRow label="Werktags (Mo–Fr)" value={value[0]} onChange={(w) => setRange(0, 4, w)} />
            <DayRow
              label="Wochenende (Sa–So)"
              value={value[5]}
              onChange={(w) => setRange(5, 6, w)}
            />
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border/70 py-3">
          <span className="text-[13px] text-muted-foreground">Jeden Tag einzeln einstellen</span>
          <Switch
            checked={perDay}
            onCheckedChange={setPerDay}
            aria-label="Tage einzeln einstellen"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3">
        <div className="font-display text-3xl font-bold leading-none text-primary tabular">
          {fit.full}
        </div>
        <p className="text-[13px] leading-snug">
          von {fit.total} EM-Spielen passen komplett in deine Zeit
          {fit.partial > 0 && (
            <span className="text-muted-foreground">, {fit.partial} weitere teilweise</span>
          )}
          .
          <span className="block text-[11.5px] text-muted-foreground">
            Berechnet mit den aktuell bekannten Anstoßzeiten.
          </span>
        </p>
      </div>
    </div>
  );
}
