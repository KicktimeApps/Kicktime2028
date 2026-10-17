import type { FixtureDef, GroupLetter, Stage } from "./types";
import { CONFIRMED_KICKOFFS } from "./draw";

/**
 * Offizieller Spielplan der UEFA EURO 2028 (UEFA, 12.11.2025).
 *
 * Datum, Spielort und Paarungs-Slots stehen fest. Die genauen Anstoßzeiten
 * vergibt die UEFA erst nach der Endrunden-Auslosung. Bis dahin verwenden wir
 * die drei offiziellen Zeitfenster (15, 18 oder 21 Uhr MESZ) als Platzhalter
 * und kennzeichnen sie in der App als „vorläufig“. Bestätigte Zeiten werden in
 * `draw.ts → CONFIRMED_KICKOFFS` eingetragen (oder kommen über die Live-Daten).
 *
 * Bekannt ist bereits: Das Finale beginnt um 18:00 Uhr MESZ.
 */

/** MESZ (UTC+2) → ISO-UTC. */
function cest(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(h - 2, m, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

type Row = [
  number: number,
  stage: Stage,
  group: GroupLetter | null,
  matchday: 1 | 2 | 3 | null,
  home: string,
  away: string,
  venueId: string,
  date: string,
  timeCest: string,
  confirmed?: boolean,
];

// prettier-ignore
const ROWS: Row[] = [
  // ---- Gruppenphase, 1. Spieltag ----
  [1,  "group", "A", 1, "A1", "A2", "cardiff",    "2028-06-09", "21:00"],
  [2,  "group", "A", 1, "A3", "A4", "glasgow",    "2028-06-10", "15:00"],
  [3,  "group", "B", 1, "B1", "B2", "manchester", "2028-06-10", "18:00"],
  [4,  "group", "B", 1, "B3", "B4", "dublin",     "2028-06-10", "21:00"],
  [5,  "group", "C", 1, "C1", "C2", "wembley",    "2028-06-11", "15:00"],
  [6,  "group", "C", 1, "C3", "C4", "birmingham", "2028-06-11", "18:00"],
  [7,  "group", "D", 1, "D3", "D4", "liverpool",  "2028-06-11", "21:00"],
  [8,  "group", "D", 1, "D1", "D2", "tottenham",  "2028-06-12", "15:00"],
  [9,  "group", "E", 1, "E1", "E2", "dublin",     "2028-06-12", "18:00"],
  [10, "group", "E", 1, "E3", "E4", "newcastle",  "2028-06-12", "21:00"],
  [11, "group", "F", 1, "F1", "F2", "glasgow",    "2028-06-13", "18:00"],
  [12, "group", "F", 1, "F3", "F4", "manchester", "2028-06-13", "21:00"],
  // ---- Gruppenphase, 2. Spieltag ----
  [13, "group", "A", 2, "A1", "A3", "cardiff",    "2028-06-14", "15:00"],
  [14, "group", "A", 2, "A2", "A4", "liverpool",  "2028-06-14", "18:00"],
  [15, "group", "B", 2, "B1", "B3", "wembley",    "2028-06-14", "21:00"],
  [16, "group", "B", 2, "B2", "B4", "birmingham", "2028-06-15", "15:00"],
  [17, "group", "C", 2, "C1", "C3", "tottenham",  "2028-06-15", "18:00"],
  [18, "group", "C", 2, "C2", "C4", "newcastle",  "2028-06-15", "21:00"],
  [19, "group", "D", 2, "D1", "D3", "wembley",    "2028-06-16", "15:00"],
  [20, "group", "D", 2, "D2", "D4", "manchester", "2028-06-16", "18:00"],
  [21, "group", "E", 2, "E1", "E3", "dublin",     "2028-06-16", "21:00"],
  [22, "group", "E", 2, "E2", "E4", "liverpool",  "2028-06-17", "15:00"],
  [23, "group", "F", 2, "F1", "F3", "glasgow",    "2028-06-17", "18:00"],
  [24, "group", "F", 2, "F2", "F4", "newcastle",  "2028-06-17", "21:00"],
  // ---- Gruppenphase, 3. Spieltag (je Gruppe zeitgleich) ----
  [25, "group", "A", 3, "A4", "A1", "cardiff",    "2028-06-18", "21:00"],
  [26, "group", "A", 3, "A2", "A3", "tottenham",  "2028-06-18", "21:00"],
  [27, "group", "B", 3, "B4", "B1", "wembley",    "2028-06-19", "21:00"],
  [28, "group", "B", 3, "B2", "B3", "dublin",     "2028-06-19", "21:00"],
  [29, "group", "C", 3, "C4", "C1", "manchester", "2028-06-20", "18:00"],
  [30, "group", "C", 3, "C2", "C3", "liverpool",  "2028-06-20", "18:00"],
  [31, "group", "D", 3, "D4", "D1", "birmingham", "2028-06-20", "21:00"],
  [32, "group", "D", 3, "D2", "D3", "newcastle",  "2028-06-20", "21:00"],
  [33, "group", "E", 3, "E4", "E1", "dublin",     "2028-06-21", "18:00"],
  [34, "group", "E", 3, "E2", "E3", "tottenham",  "2028-06-21", "18:00"],
  [35, "group", "F", 3, "F4", "F1", "glasgow",    "2028-06-21", "21:00"],
  [36, "group", "F", 3, "F2", "F3", "cardiff",    "2028-06-21", "21:00"],
  // ---- Achtelfinale ----
  [37, "r16", null, null, "1A", "2C",    "cardiff",    "2028-06-24", "21:00"],
  [38, "r16", null, null, "2A", "2B",    "liverpool",  "2028-06-24", "18:00"],
  [39, "r16", null, null, "1B", "3ADEF", "newcastle",  "2028-06-25", "21:00"],
  [40, "r16", null, null, "1C", "3DEF",  "manchester", "2028-06-25", "18:00"],
  [41, "r16", null, null, "1F", "3ABC",  "glasgow",    "2028-06-26", "21:00"],
  [42, "r16", null, null, "2D", "2E",    "tottenham",  "2028-06-26", "18:00"],
  [43, "r16", null, null, "1D", "2F",    "birmingham", "2028-06-27", "18:00"],
  [44, "r16", null, null, "1E", "3ABCD", "dublin",     "2028-06-27", "21:00"],
  // ---- Viertelfinale ----
  [45, "qf", null, null, "W39", "W37", "wembley", "2028-06-30", "18:00"],
  [46, "qf", null, null, "W41", "W42", "dublin",  "2028-06-30", "21:00"],
  [47, "qf", null, null, "W44", "W43", "glasgow", "2028-07-01", "18:00"],
  [48, "qf", null, null, "W40", "W38", "cardiff", "2028-07-01", "21:00"],
  // ---- Halbfinale ----
  [49, "sf", null, null, "W45", "W46", "wembley", "2028-07-04", "21:00"],
  [50, "sf", null, null, "W47", "W48", "wembley", "2028-07-05", "21:00"],
  // ---- Finale ----
  [51, "final", null, null, "W49", "W50", "wembley", "2028-07-09", "18:00", true],
];

export const FIXTURES: FixtureDef[] = ROWS.map(
  ([number, stage, group, matchday, home, away, venueId, date, time, confirmed]) => {
    const override = CONFIRMED_KICKOFFS[number];
    return {
      number,
      stage,
      ...(group ? { group } : {}),
      ...(matchday ? { matchday } : {}),
      home,
      away,
      venueId,
      kickoffUtc: override ?? cest(date, time),
      kickoffConfirmed: !!override || !!confirmed,
    };
  },
);

export const GROUPS: GroupLetter[] = ["A", "B", "C", "D", "E", "F"];

export const matchId = (n: number) => `m${String(n).padStart(2, "0")}`;
