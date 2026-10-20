import type { LivePhase, MatchStatus } from "@/domain/types";
import type { Announcement } from "./announcement";
import { getSupabase } from "./supabase";

/**
 * Admin-Aktionen laufen ausschließlich über die Edge Function `admin`, die
 * die PIN serverseitig prüft (Secret ADMIN_PIN) und Fehlversuche drosselt.
 * Der Client kennt die PIN nie.
 */
async function invoke<T>(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Kein Backend konfiguriert" };
  try {
    const { data, error } = await sb.functions.invoke("admin", { body });
    if (error) return { ok: false, error: error.message };
    if (data && typeof data === "object" && "error" in data)
      return { ok: false, error: String(data.error) };
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const verifyPin = async (pin: string) => (await invoke({ action: "verify", pin })).ok;

export type OverrideInput = {
  matchId: string;
  status: MatchStatus;
  scoreHome: number;
  scoreAway: number;
  pensHome: number | null;
  pensAway: number | null;
  phase: LivePhase | null;
  /** Stand der Live-Quelle beim Speichern (siehe resultSignature). */
  sourceSig: string;
};

export const setOverride = (pin: string, o: OverrideInput) => invoke({ action: "set", pin, ...o });
export const clearOverride = (pin: string, matchId: string) =>
  invoke({ action: "clear", pin, matchId });

export type Stats = {
  online: number;
  day: number;
  week: number;
  total: number;
  topTeams: { team: string; count: number }[];
  /** Fehlt bei älterer Server-Funktion. */
  push?: { subscriptions: number; upcoming: number; sent24h: number };
  /** Ausführliche Statistik (SQL-Update „Admin-Ausbau“), sonst null. */
  ext?: StatsExt | null;
};

export type StatsExt = {
  online: number;
  today: number;
  day: number;
  week: number;
  month: number;
  total: number;
  new7: number;
  returning7: number;
  installed: number;
  pushOn: number;
  subscriptions: number;
  daily: { day: string; count: number }[];
  platforms: Record<string, number>;
  browsers: Record<string, number>;
  versions: { version: string; count: number }[];
  topTeams: { team: string; count: number }[];
};
export const fetchStats = (pin: string) => invoke<Stats>({ action: "stats", pin });

export type FeedbackRow = {
  id?: number;
  rating: number;
  message: string | null;
  created_at: string;
  app_version: string | null;
};
export const fetchFeedback = (pin: string) =>
  invoke<{ rows: FeedbackRow[] }>({ action: "feedback", pin });

/** Anstoßzeiten an den Server geben (Sperre für Tipprunden ab Anpfiff). */
export const syncFixtures = (pin: string, fixtures: { matchId: string; kickoffUtc: string }[]) =>
  invoke<{ ok: true; count: number }>({ action: "fixtures", pin, fixtures });

/** Alle Tipprunden auf dem Server löschen (mit Mitgliedern und Tipps). */
export const deleteAllTipGroups = (pin: string) =>
  invoke<{ ok: true; count: number }>({ action: "delete_tip_groups", pin });

/** Ein Feedback (id) oder alle ("all") löschen. */
export const deleteFeedback = (pin: string, id: number | "all") =>
  invoke({ action: "feedback_delete", pin, id });

/** Alle Admin-Korrekturen auf einmal entfernen. */
export const clearAllOverrides = (pin: string) =>
  invoke<{ ok: true; count: number }>({ action: "clear_overrides", pin });

/* ---------- Live-Quelle & Einstellungen ---------- */

export type LiveSource = { league: string; season: string; suffix: string; paused: boolean };

export type AdminConfig = {
  liveSource: LiveSource | null;
  defaults: { league: string; season: string };
  announcement: Announcement | null;
  cache: { id: string; fetched_at: string }[];
  storedResults: number;
};
export const fetchConfig = (pin: string) => invoke<AdminConfig>({ action: "config", pin });

export const saveLiveSource = (pin: string, src: LiveSource) =>
  invoke<{ ok: true; url: string }>({ action: "set_source", pin, ...src });

export type SourceTest = {
  url: string;
  status: number;
  count: number;
  finished?: number;
  from?: string | null;
  to?: string | null;
  sample?: string[];
  error?: string;
};
export const testLiveSource = (pin: string, src: Omit<LiveSource, "paused">) =>
  invoke<SourceTest>({ action: "test_source", pin, ...src });

export const clearLiveCache = (pin: string) => invoke({ action: "clear_cache", pin });
export const resetStoredResults = (pin: string) =>
  invoke<{ ok: true; count: number }>({ action: "reset_results", pin });

/* ---------- Mitteilungen ---------- */

export const saveAnnouncement = (
  pin: string,
  a: { text: string; tone: Announcement["tone"]; until: string | null },
) => invoke({ action: "set_announcement", pin, ...a });

export type BroadcastResult = { total: number; sent: number; failed: number; cleaned: number };
export const sendBroadcast = (
  pin: string,
  msg: { title: string; body: string; url?: string; onlyDevice?: string },
) => invoke<BroadcastResult>({ action: "broadcast", pin, ...msg });

/* ---------- Tipprunden ---------- */

export type AdminGroup = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  owner: string | null;
  members: number;
  pending: number;
  banned: number;
  tips: number;
};
export type AdminMember = {
  memberId: string;
  name: string;
  owner: boolean;
  approved: boolean;
  banned: boolean;
  joinedAt: string;
  tips: number;
  champion: string | null;
};
export const fetchGroups = (pin: string) =>
  invoke<{ data: AdminGroup[] }>({ action: "groups", pin });
export const fetchGroup = (pin: string, groupId: string) =>
  invoke<{ data: AdminMember[] }>({ action: "group", pin, groupId });
export const deleteGroup = (pin: string, groupId: string) =>
  invoke({ action: "group_delete", pin, groupId });
export const removeMember = (pin: string, groupId: string, memberId: string, ban: boolean) =>
  invoke({ action: "member_remove", pin, groupId, memberId, ban });
export const unbanMember = (pin: string, groupId: string, memberId: string) =>
  invoke({ action: "member_unban", pin, groupId, memberId });
export const transferOwner = (pin: string, groupId: string, memberId: string) =>
  invoke({ action: "owner_transfer", pin, groupId, memberId });
