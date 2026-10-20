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
  /** Beitrittsanfrage gestellt, der Ersteller hat noch nicht angenommen. */
  pending?: boolean;
  /** Offene Beitrittsanfragen (nur für den Ersteller). */
  requests?: number;
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

export type TipRequest = { id: string; name: string };

export type TipBoard = {
  group: { id: string; code: string; name: string; isOwner: boolean };
  members: TipMember[];
  /** Offene Beitrittsanfragen – nur der Ersteller bekommt sie. */
  requests?: TipRequest[];
};

/** Serverfehler → verständlicher deutscher Text. */
const MESSAGES: [string, string][] = [
  ["group not found", "Diese Tipprunde gibt es nicht. Bitte den Code prüfen."],
  ["banned", "Du kannst dieser Tipprunde nicht mehr beitreten."],
  ["name taken", "Diesen Namen gibt es in der Runde schon. Bitte einen anderen wählen."],
  ["name invalid", "Der Name muss 2 bis 20 Zeichen lang sein."],
  ["group name invalid", "Der Name der Runde muss 2 bis 40 Zeichen lang sein."],
  ["group full", "Die Runde ist voll (höchstens 50 Mitspieler)."],
  ["too many groups", "Du hast schon 5 Runden erstellt."],
  ["too many memberships", "Du bist schon in 10 Runden."],
  ["not owner", "Das darf nur, wer die Runde erstellt hat."],
  ["not a member", "Du bist (nicht mehr) in dieser Runde."],
  ["match started", "Das Spiel hat schon begonnen – Tippen ist nicht mehr möglich."],
  ["champion locked", "Das Eröffnungsspiel hat begonnen – der Europameister-Tipp ist fest."],
  ["unknown match", "Dieses Spiel kennt der Server noch nicht."],
  ["pending", "Der Ersteller der Runde muss dich noch annehmen."],
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
  rpc<{ id: string; code: string; name: string; pending?: boolean }>("kt_tip_join", {
    p_code: code,
    p_player: player,
  });

/** Selbst verlassene/gelöschte Runden – deren Verschwinden ist kein „Rauswurf“. */
const leftByMe = new Set<string>();
export const wasLeftByMe = (groupId: string) => leftByMe.has(groupId);

export const leaveGroup = (groupId: string) => {
  leftByMe.add(groupId);
  return rpc<null>("kt_tip_leave", { p_group: groupId });
};
export const deleteGroup = (groupId: string) => {
  leftByMe.add(groupId);
  return rpc<null>("kt_tip_delete", { p_group: groupId });
};
/**
 * Mitglied rauswerfen: `ban` = sperren (kein Wiederbeitritt, bis entsperrt),
 * sonst nur entfernen (darf mit dem Code wieder anfragen).
 */
export async function kickMember(groupId: string, memberId: string, ban: boolean): Promise<void> {
  try {
    await rpc<null>("kt_tip_remove", { p_group: groupId, p_member: memberId, p_ban: ban });
  } catch (err) {
    // SQL-Update „Entfernen oder Sperren“ fehlt: dann kann der Server nur sperren.
    if (!(err instanceof TipError && err.notInstalled)) throw err;
    if (!ban) throw new TipError("Nur entfernen geht erst nach dem nächsten Server-Update.");
    await rpc<null>("kt_tip_kick", { p_group: groupId, p_member: memberId });
  }
}

/** Vom Ersteller gesperrte Mitglieder (nur für den Ersteller). */
export const bannedMembers = (groupId: string) =>
  rpc<{ id: string; name: string }[] | null>("kt_tip_banned", { p_group: groupId }).then(
    (l) => l ?? [],
  );

export const unbanMember = (groupId: string, memberId: string) =>
  rpc<null>("kt_tip_unban", { p_group: groupId, p_member: memberId });
export const renameMe = (groupId: string, player: string) =>
  rpc<null>("kt_tip_rename", { p_group: groupId, p_player: player });

/** Beitrittsanfrage annehmen oder ablehnen (nur Ersteller). */
export const answerRequest = (groupId: string, memberId: string, accept: boolean) =>
  rpc<null>("kt_tip_answer", { p_group: groupId, p_member: memberId, p_accept: accept });

export const myGroups = () => rpc<TipGroup[]>("kt_tip_my_groups", {});

export type MyBan = { id: string; name: string; by?: "owner" | "admin" };

/** Runden, aus denen dieses Gerät gesperrt wurde (leer ohne SQL-Update). */
export async function myBans(): Promise<MyBan[]> {
  try {
    return (await rpc<MyBan[] | null>("kt_tip_my_bans", {})) ?? [];
  } catch {
    return [];
  }
}
export const loadBoard = (groupId: string) => rpc<TipBoard>("kt_tip_board", { p_group: groupId });

/** Einen Tipp in einer Runde speichern (der Server prüft den Anpfiff). */
export const setTip = (groupId: string, matchId: string, home: number, away: number) =>
  rpc<null>("kt_tip_set", { p_group: groupId, p_match: matchId, p_home: home, p_away: away });

export const clearTip = (groupId: string, matchId: string) =>
  rpc<null>("kt_tip_clear", { p_group: groupId, p_match: matchId });

/** Bisherige Einzel-Tipps (offene Spiele) in eine Runde übernehmen. */
export const importTips = (
  groupId: string,
  tips: { match_id: string; home: number; away: number }[],
) => rpc<number>("kt_tip_import", { p_group: groupId, p_tips: tips });

export const setGroupChampion = (groupId: string, champion: string | null) =>
  rpc<null>("kt_tip_set_champion", { p_group: groupId, p_champion: champion });

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
