import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function useSecondTick(enabled: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setT((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
}

/** Große Anzeigetafel-Uhr: Tage · Std · Min (· Sek bei < 1 Tag). */
export function Countdown({
  target,
  now,
  className,
}: {
  target: number;
  now: number;
  className?: string;
}) {
  // Sekundengenau nur im echten Modus; im Demo-Modus läuft die Store-Uhr.
  const realNow = Math.abs(now - Date.now()) < 60_000;
  useSecondTick(realNow);
  const t = realNow ? Date.now() : now;
  const diff = Math.max(0, target - t);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const units =
    days > 0
      ? [
          [days, days === 1 ? "Tag" : "Tage"],
          [hours, "Std"],
          [minutes, "Min"],
        ]
      : [
          [hours, "Std"],
          [minutes, "Min"],
          [seconds, "Sek"],
        ];
  return (
    <div className={cn("flex items-end gap-2", className)} role="timer" aria-live="off">
      {units.map(([v, l], i) => (
        <div key={i} className="flex items-end gap-2">
          {i > 0 && (
            <span className="pb-6 font-display text-3xl font-bold text-muted-foreground/40">:</span>
          )}
          <div className="flex flex-col items-center">
            <span className="min-w-[2ch] text-center font-display text-[52px] font-bold leading-none tabular sm:text-6xl">
              {i === 0 && days > 0 ? v : String(v).padStart(2, "0")}
            </span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {l}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
