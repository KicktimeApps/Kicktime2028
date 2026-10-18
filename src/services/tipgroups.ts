import type { Score } from "@/domain/types";
import { getDeviceId } from "@/lib/device-id";
import { getSupabase } from "./supabase";

/**
 * Tipprunden mit Freunden – ohne Login. Das Gerät weist sich mit seiner
 * geheimen Geräte-ID aus; andere sehen nur eine davon unabhängige
 * Mitglieds-ID. Alle Regeln (Sperre ab Anpfiff, Sichtbarkeit, Rauswurf)
 * prüft der Server (siehe Migration „tipprunde“).
 */

export type TipGroup = {
  id: string;
  code: string;
  name: string;
  isOwner: boolean;
  members: number;
};

export type TipMember = {
  id: string;
  name: string;
  isOwner: boolean;
  isMe: boolean;
  champion: string | null;
  /** Fremde Tipps nur für Spiele, die schon angepfiffen sind. */
  tips: Record<string, Pick<Score, "home" | "away">>;
};

export type TipBoard = {
  group: { id: string; code: string; name: string; isOwner: boolean };
  members: TipMember[];
};

/** Serverfehler → verständlicher deutscher Text. */
const MESSAGES: [string, string][] = [
  ["group not found", "Diese Tipprunde gibt es nicht. Bitte den Code prüfen."],
  ["banned", "Du wurdest aus dieser Tipprunde entfernt."],
  ["name taken", "Diesen Namen gibt es in der Runde schon. Bitte einen anderen wählen."],
  ["name invalid", "Der Name muss 2 bis 20 Zeichen lang sein."],
  ["group name invalid", "Der Name der Runde muss 2 bis 40 Zeichen lang sein."],
  ["group full", "Die Runde ist voll (höchstens 50 Mitspieler)."],
  ["too many groups", "Du hast schon 5 Runden erstellt."],
  ["too many memberships", "Du bist schon in 10 Runden."],
  ["not owner", "Das darf nur, wer die Runde erstellt hat."],
  ["not a member", "Du bist (nicht mehr) in dieser Runde."],
];

export class TipError extends Error {
  /** Server kennt die Tipprunden-Funktionen noch nicht (SQL-Update fehlt). */
  notInstalled = false;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await getSupabase();
  if (!sb) throw new TipError("Tipprunden brauchen eine Internetverbindung zum KickTime-Server.");
  const { data, error } = await sb.rpc(fn, { p_device: getDeviceId(), ...args });
  if (error) {
    // Längste Übereinstimmung zuerst („group name invalid“ vor „name invalid“)
    const hit = [...MESSAGES]
      .sort((a, b) => b[0].length - a[0].length)
      .find(([key]) => error.message.includes(key));
    if (hit) throw new TipError(hit[1]);
    if (error.code === "PGRST202") {
      const e = new TipError("Tipprunden sind auf dem Server noch nicht eingerichtet.");
      e.notInstalled = true;
      throw e;
    }
    throw new TipError("Das hat nicht geklappt. Bitte später noch einmal versuchen.");
  }
  return data as T;
}

export const createGroup = (groupName: string, player: string) =>
  rpc<{ id: string; code: string; name: string }>("kt_tip_create", {
    p_group_name: groupName,
    p_player: player,
  });

export const joinGroup = (code: string, player: string) =>
  rpc<{ id: string; code: string; name: string }>("kt_tip_join", {
    p_code: code,
    p_player: player,
  });

export const leaveGroup = (groupId: string) => rpc<null>("kt_tip_leave", { p_group: groupId });
export const deleteGroup = (groupId: string) => rpc<null>("kt_tip_delete", { p_group: groupId });
export const kickMember = (groupId: string, memberId: string) =>
  rpc<null>("kt_tip_kick", { p_group: groupId, p_member: memberId });
export const renameMe = (groupId: string, player: string) =>
  rpc<null>("kt_tip_rename", { p_group: groupId, p_player: player });

export const myGroups = () => rpc<TipGroup[]>("kt_tip_my_groups", {});
export const loadBoard = (groupId: string) => rpc<TipBoard>("kt_tip_board", { p_group: groupId });

/** Offene Tipps (vor Anpfiff) und Europameister-Tipp an den Server geben. */
export const saveTips = (
  tips: { match_id: string; home: number; away: number }[],
  champion: string | null,
) => rpc<null>("kt_tip_save", { p_tips: tips, p_champion: champion });

/** Code normalisieren: Großbuchstaben, nur erlaubte Zeichen, 6 Stellen. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/runde/${code}`;
}
