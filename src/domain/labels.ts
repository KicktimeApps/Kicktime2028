import { HOST_SLOTS } from "@/tournament/draw";
import { getNation } from "@/tournament/nations";

/**
 * Lesbarer Name für einen noch offenen Teilnehmer-Slot.
 *  "A1"    → "Gruppe A · Team 1"
 *  "1A"    → "Sieger Gruppe A"
 *  "2C"    → "Zweiter Gruppe C"
 *  "3ADEF" → "Dritter A/D/E/F"
 *  "W37"   → "Sieger Spiel 37"
 */
function slotLabel(slot: string): string {
  let m = slot.match(/^([A-F])([1-4])$/);
  if (m) return `Gruppe ${m[1]} · Team ${m[2]}`;
  m = slot.match(/^1([A-F])$/);
  if (m) return `Sieger Gruppe ${m[1]}`;
  m = slot.match(/^2([A-F])$/);
  if (m) return `Zweiter Gruppe ${m[1]}`;
  m = slot.match(/^3([A-F]+)$/);
  if (m) return `Dritter ${m[1].split("").join("/")}`;
  m = slot.match(/^W(\d+)$/);
  if (m) return `Sieger Spiel ${m[1]}`;
  return slot;
}

/** Kurzform für enge Layouts (Bracket). */
export function slotShort(slot: string): string {
  let m = slot.match(/^([A-F][1-4])$/);
  if (m) return m[1];
  m = slot.match(/^([12])([A-F])$/);
  if (m) return `${m[1]}. ${m[2]}`;
  m = slot.match(/^3([A-F]+)$/);
  if (m) return `3. ${m[1].split("").join("/")}`;
  m = slot.match(/^W(\d+)$/);
  if (m) return `Sieger ${m[1]}`;
  return slot;
}

/** Hinweis auf gesetzten Gastgeber, z. B. „Wales, falls qualifiziert“. */
export function hostHint(slot: string): string | null {
  const code = HOST_SLOTS[slot];
  if (!code) return null;
  return `${getNation(code)?.name ?? code}, falls qualifiziert`;
}

export type TeamDisplay = {
  code: string | null;
  name: string;
  short: string;
  flag: string | null;
  placeholder: boolean;
};

export function teamDisplay(code: string | null, slot: string): TeamDisplay {
  const n = getNation(code);
  if (n) return { code: n.code, name: n.name, short: n.short, flag: n.flag, placeholder: false };
  return {
    code: null,
    name: slotLabel(slot),
    short: slotShort(slot),
    flag: null,
    placeholder: true,
  };
}
