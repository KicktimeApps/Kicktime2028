import type { FreeTv, Stage } from "./types";

/**
 * TV-Rechte EM 2028 in Deutschland:
 *  - ARD und ZDF halten die Rechte an allen 51 Spielen und zeigen je 17
 *    Spiele im Free-TV (34 gesamt), darunter alle Spiele der deutschen
 *    Mannschaft, fünf Achtelfinals, zwei Viertelfinals, beide Halbfinals und
 *    das Finale.
 *  - Die Telekom (MagentaTV) zeigt alle 51 Spiele, 17 davon exklusiv.
 *
 * Welches Spiel konkret bei ARD, ZDF oder exklusiv bei MagentaTV läuft, wird
 * erst nach der Auslosung festgelegt. Bekannte Zuteilungen in FREE_TV
 * (Spielnummer → Sender) bzw. MAGENTA_EXCLUSIVE eintragen.
 */
export const FREE_TV: Record<number, FreeTv> = {};

/** Spielnummern, die nur bei MagentaTV laufen. */
export const MAGENTA_EXCLUSIVE: number[] = [];

export type TvInfo = {
  /** Sicher feststehender Free-TV-Sender. */
  freeTv: FreeTv | null;
  /** Free-TV ist sicher (z. B. Deutschland-Spiel, Halbfinale), Sender aber offen. */
  freeTvLikely: boolean;
  magentaExclusive: boolean;
  /** Kurzlabel für Karten. */
  label: string;
};

const ALWAYS_FREE: Stage[] = ["sf", "final"];

export function getTvInfo(match: {
  number: number;
  stage: Stage;
  home: string | null;
  away: string | null;
}): TvInfo {
  const freeTv = FREE_TV[match.number] ?? null;
  const magentaExclusive = MAGENTA_EXCLUSIVE.includes(match.number);
  if (freeTv) {
    return { freeTv, freeTvLikely: true, magentaExclusive: false, label: `${freeTv} · MagentaTV` };
  }
  if (magentaExclusive) {
    return { freeTv: null, freeTvLikely: false, magentaExclusive: true, label: "nur MagentaTV" };
  }
  const germany = match.home === "GER" || match.away === "GER";
  if (germany || ALWAYS_FREE.includes(match.stage)) {
    return { freeTv: null, freeTvLikely: true, magentaExclusive: false, label: "ARD/ZDF · MagentaTV" };
  }
  return { freeTv: null, freeTvLikely: false, magentaExclusive: false, label: "MagentaTV · Free-TV offen" };
}

export const BROADCASTER_URLS: Record<string, string> = {
  ARD: "https://www.sportschau.de",
  ZDF: "https://www.zdf.de/sport",
  MagentaTV: "https://www.magentatv.de",
};
