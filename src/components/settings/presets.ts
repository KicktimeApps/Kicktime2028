import { useMemo } from "react";
import { DEFAULT_AVAILABILITY, fitFor, type WeekAvailability } from "@/domain/time";
import { FIXTURES } from "@/tournament/schedule";

export const PRESETS: { id: string; label: string; hint: string; week: WeekAvailability }[] = [
  {
    id: "evening",
    label: "Feierabend",
    hint: "Werktags ab 17:30, am Wochenende ganztags",
    week: DEFAULT_AVAILABILITY,
  },
  {
    id: "flexible",
    label: "Flexibel",
    hint: "Homeoffice, Schicht oder Urlaub – meist ab 14 Uhr",
    week: [
      ...Array(5).fill({ start: 14, end: 24 }),
      { start: 10, end: 24.5 },
      { start: 10, end: 24.5 },
    ],
  },
  {
    id: "weekend",
    label: "Nur Wochenende",
    hint: "Unter der Woche keine Zeit",
    week: [
      ...Array.from({ length: 5 }, () => ({ start: 18, end: 23, off: true })),
      { start: 11, end: 24.5 },
      { start: 11, end: 24.5 },
    ],
  },
  {
    id: "all",
    label: "Immer",
    hint: "Ich will jedes Spiel sehen",
    week: Array(7).fill({ start: 8, end: 26 }),
  },
];

export function presetMatches(week: WeekAvailability): string | null {
  return PRESETS.find((p) => JSON.stringify(p.week) === JSON.stringify(week))?.id ?? null;
}

/** Wie viele der 51 Spiele passen (ganz oder teilweise) in die Woche? */
export function useFitCount(week: WeekAvailability, timeZone: string) {
  return useMemo(() => {
    let full = 0;
    let partial = 0;
    for (const f of FIXTURES) {
      const fit = fitFor(f.kickoffUtc, timeZone, week);
      if (fit === "full") full++;
      else if (fit === "partial") partial++;
    }
    return { full, partial, total: FIXTURES.length };
  }, [week, timeZone]);
}
