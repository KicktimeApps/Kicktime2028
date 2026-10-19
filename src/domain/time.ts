/**
 * Zeit- und Zeitfenster-Logik.
 *
 * Zeitfenster werden pro Wochentag gespeichert (0 = Montag … 6 = Sonntag).
 * `end` darf über 24 hinausgehen (max. 28 = 04:00 Uhr am Folgetag). So gehört
 * ein Spiel um 00:30 Uhr in der Nacht von Freitag auf Samstag logisch noch zum
 * Freitagabend – das alte Modell hat solche Spiele dem Samstag zugeordnet.
 */

export type DayWindow = { start: number; end: number; off?: boolean };
/** Index 0 = Montag … 6 = Sonntag. */
export type WeekAvailability = DayWindow[];

export const DAY_NAMES = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export const DEFAULT_AVAILABILITY: WeekAvailability = [
  ...Array.from({ length: 5 }, () => ({ start: 17.5, end: 23.5 })),
  { start: 11, end: 24.5 },
  { start: 11, end: 24.5 },
];

/** Typische Spieldauer inkl. Halbzeit (ohne Verlängerung). */
const MATCH_MINUTES = 110;

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Montag … 6 = Sonntag */
  weekday: number;
  /** YYYY-MM-DD in der Zielzeitzone. */
  dayKey: string;
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function localParts(utc: string | number | Date, timeZone: string): LocalParts {
  const date = utc instanceof Date ? utc : new Date(utc);
  const p: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) p[part.type] = part.value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    year,
    month,
    day,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAY_INDEX[p.weekday] ?? 0,
    dayKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/** Wochentag-Index (Mo=0) des Vortags. */
const prevDay = (weekday: number) => (weekday + 6) % 7;

/**
 * Wie viele Minuten eines Spiels (Anstoß + MATCH_MINUTES) liegen im
 * Zeitfenster des Nutzers? Berücksichtigt Fenster, die über Mitternacht gehen.
 */
export function watchableMinutes(
  kickoffUtc: string,
  timeZone: string,
  week: WeekAvailability,
  duration = MATCH_MINUTES,
): number {
  const p = localParts(kickoffUtc, timeZone);
  const t = p.hour + p.minute / 60;
  // Zwei Kandidaten: Fenster des eigenen Tages und das in die Nacht
  // hineinragende Fenster des Vortags (t + 24 in dessen Koordinaten).
  const candidates: Array<{ w: DayWindow; at: number }> = [
    { w: week[p.weekday], at: t },
    { w: week[prevDay(p.weekday)], at: t + 24 },
  ];
  let best = 0;
  for (const { w, at } of candidates) {
    if (!w || w.off) continue;
    const from = Math.max(at, w.start);
    const to = Math.min(at + duration / 60, w.end);
    best = Math.max(best, Math.max(0, to - from) * 60);
  }
  return Math.round(best);
}

export type Fit = "full" | "partial" | "none";

/**
 * Passt das Spiel in den Alltag?
 *  - full:    (fast) komplett schaubar
 *  - partial: mindestens eine Halbzeit schaubar
 */
export function fitFor(kickoffUtc: string, timeZone: string, week: WeekAvailability): Fit {
  const minutes = watchableMinutes(kickoffUtc, timeZone, week);
  if (minutes >= MATCH_MINUTES - 10) return "full";
  if (minutes >= 45) return "partial";
  return "none";
}

export function formatHour(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const hh = Math.floor(norm);
  const mm = Math.round((norm - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Formatierung für die Anzeige                                        */
/* ------------------------------------------------------------------ */

const timeFmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const key = timeZone + JSON.stringify(opts);
  let f = timeFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("de-DE", { timeZone, ...opts });
    timeFmtCache.set(key, f);
  }
  return f;
}

export function formatTime(utc: string, timeZone: string): string {
  return fmt(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(utc),
  );
}

/** „Fr., 9. Juni“ */
export function formatDayLong(utc: string, timeZone: string): string {
  return fmt(timeZone, { weekday: "short", day: "numeric", month: "long" }).format(new Date(utc));
}

/** „Fr 09.06.“ */
export function formatDayShort(utc: string, timeZone: string): string {
  const p = localParts(utc, timeZone);
  return `${DAY_SHORT[p.weekday]} ${String(p.day).padStart(2, "0")}.${String(p.month).padStart(2, "0")}.`;
}

/** „Freitag, 9. Juni 2028“ */
export function formatDate(utc: string, timeZone: string): string {
  return fmt(timeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(utc),
  );
}

/** Relativer Tagesname: „Heute“, „Morgen“, „Gestern“ oder null. */
export function relativeDay(utc: string, now: number, timeZone: string): string | null {
  const a = localParts(utc, timeZone).dayKey;
  const today = localParts(now, timeZone).dayKey;
  if (a === today) return "Heute";
  const tomorrow = localParts(now + 86_400_000, timeZone).dayKey;
  if (a === tomorrow) return "Morgen";
  const yesterday = localParts(now - 86_400_000, timeZone).dayKey;
  if (a === yesterday) return "Gestern";
  return null;
}

/** Kurze Dauer bis zu einem Zeitpunkt: „in 3 Tagen“, „in 4 Std.“, „in 12 Min.“ */
export function formatCountdownShort(target: number, now: number): string {
  const diff = target - now;
  if (diff <= 0) return "jetzt";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `in ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 48) return `in ${h} Std.`;
  return `in ${Math.round(h / 24)} Tagen`;
}

export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  } catch {
    return "Europe/Berlin";
  }
}

export const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: "Europe/Berlin", label: "Deutschland, Österreich, Schweiz (MESZ)" },
  { id: "Europe/London", label: "Großbritannien (BST)" },
  { id: "Europe/Dublin", label: "Irland (IST)" },
  { id: "Europe/Lisbon", label: "Portugal (WEST)" },
  { id: "Europe/Athens", label: "Griechenland, Finnland, Rumänien (OESZ)" },
  { id: "Europe/Istanbul", label: "Türkei (TRT)" },
  { id: "America/New_York", label: "USA Ostküste (EDT)" },
  { id: "America/Los_Angeles", label: "USA Westküste (PDT)" },
  { id: "Asia/Dubai", label: "Dubai (GST)" },
  { id: "Asia/Bangkok", label: "Thailand (ICT)" },
  { id: "Australia/Sydney", label: "Australien Ost (AEST)" },
];
