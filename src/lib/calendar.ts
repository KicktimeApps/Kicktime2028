import { teamDisplay } from "@/domain/labels";
import type { MatchView } from "@/domain/types";
import { STAGE_LABEL, TOURNAMENT } from "@/tournament/config";
import { getTvInfo } from "@/tournament/tv";

/**
 * iCalendar-Export (.ics) – für ein einzelnes Spiel oder alle eigenen Spiele
 * auf einmal. Stabile UIDs: ein erneuter Import aktualisiert die Termine.
 */

function icsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Zeilen > 75 Zeichen müssen laut RFC 5545 umbrochen werden. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

function event(m: MatchView, reminderMin: number | null): string[] {
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const start = new Date(m.kickoffUtc);
  const end = new Date(start.getTime() + (m.stage === "group" ? 115 : 150) * 60_000);
  const stage = m.stage === "group" ? `Gruppe ${m.group}` : STAGE_LABEL[m.stage];
  const tv = getTvInfo(m);
  const lines = [
    `${TOURNAMENT.name} · ${stage} · Spiel ${m.number}`,
    `TV: ${tv.label}`,
    `${m.venue.name}, ${m.venue.city}`,
  ];
  if (!m.kickoffConfirmed)
    lines.push("Hinweis: Anstoßzeit noch vorläufig – bitte vor dem Spiel prüfen.");
  const ev = [
    "BEGIN:VEVENT",
    `UID:kicktime-${TOURNAMENT.id}-${m.id}@kicktime`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(`⚽ ${a.name} – ${b.name}`)}`,
    `DESCRIPTION:${esc(lines.join("\n"))}`,
    `LOCATION:${esc(`${m.venue.name}, ${m.venue.city}`)}`,
  ];
  if (reminderMin) {
    ev.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${reminderMin}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Anpfiff in ${reminderMin} Minuten: ${a.name} – ${b.name}`)}`,
      "END:VALARM",
    );
  }
  ev.push("END:VEVENT");
  return ev;
}

export function buildIcs(matches: MatchView[], reminderMin: number | null = 15): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KickTime//EM 2028 Planer//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`KickTime · ${TOURNAMENT.name}`)}`,
    ...matches.flatMap((m) => event(m, reminderMin)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(matches: MatchView[], filename: string): void {
  const blob = new Blob([buildIcs(matches)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
