import type { LivePhase, MatchStatus } from "@/domain/types";
import type { Announcement } from "./announcement";
import { getDeviceId } from "@/lib/device-id";
import { getSupabase } from "./supabase";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Admin-Aktionen laufen ausschließlich über die Edge Function `admin`, die
 * die PIN serverseitig prüft (Secret ADMIN_PIN) und Fehlversuche drosselt.
 * Der Client kennt die PIN nie.
 *
 * Der Server zählt jede Anfrage vorab als möglichen Fehlversuch (5 je Gerät
 * gleichzeitig). Darum höchstens {@link MAX_PARALLEL} Anfragen auf einmal –
 * sonst sperrt sich das Team beim Laden vieler Bereiche selbst aus.
 */
const MAX_PARALLEL = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const first = await limited(() => invokeOnce<T>(body));
  // Kurz zu viele gleichzeitig (429): einmal etwas später wiederholen. Bei
  // falscher PIN antwortet der Server mit 401 – das wird nie wiederholt.
  if (first.ok || first.status !== 429 || body.action === "verify") return strip(first);
  await new Promise((r) => setTimeout(r, 1500));
  return strip(await limited(() => invokeOnce<T>(body)));
}

const strip = <T>(r: Result<T> & { status?: number }): Result<T> =>
  r.ok ? r : { ok: false, error: r.error };

async function invokeOnce<T>(
  body: Record<string, unknown>,
): Promise<Result<T> & { status?: number }> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Kein Backend konfiguriert" };
  try {
    // `by`: welches Gerät handelt – nur für das Team-Protokoll („dieses Gerät“).
    const { data, error } = await sb.functions.invoke("admin", {
      body: { ...body, by: getDeviceId() },
    });
    if (error) {
      // Bei 4xx/5xx steckt die verständliche Meldung im Antwort-Text.
      const res = (error as { context?: Response }).context;
      const detail = await res
        ?.clone()
        .json()
        .then((b: { error?: string }) => b?.error)
        .catch(() => undefined);
      return { ok: false, error: detail ?? error.message, status: res?.status };
    }
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
  rating: number | null;
  message: string | null;
  created_at: string;
  app_version: string | null;
  category?: string | null;
};
export const fetchFeedback = (pin: string) =>
  invoke<{ rows: FeedbackRow[] }>({ action: "feedback", pin });

/**
 * Anstoßzeiten an den Server geben (Sperre für Tipprunden ab Anpfiff). Mit
 * Paarung (`title`) – die Tipp-Erinnerung nennt sie im Text.
 */
export const syncFixtures = (
  pin: string,
  fixtures: { matchId: string; kickoffUtc: string; title?: string }[],
) => invoke<{ ok: true; count: number }>({ action: "fixtures", pin, fixtures });

/** Anstoßzeiten, nach denen der Server Tipps sperrt (kt_fixtures) – zum Vergleich mit der App. */
export type ServerFixture = { match_id: string; kickoff_utc: string; title: string | null };
export const fetchServerFixtures = (pin: string) =>
  invoke<{ rows: ServerFixture[] }>({ action: "fixtures_list", pin });

/** Wächter: aktuelle und kürzlich behobene Probleme der Live-Daten. */
export type WatchAlert = {
  key: string;
  message: string;
  active: boolean;
  first_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};
/** null = SQL-Update „Wächter“ fehlt noch. */
export const fetchAlerts = (pin: string) =>
  invoke<{ alerts: WatchAlert[] | null }>({ action: "alerts", pin });
/** Test-Mitteilung an alle eingetragenen Team-Geräte. */
export const sendAlertTest = (pin: string) =>
  invoke<{ ok: true; count: number; skipped?: number }>({ action: "alert_test", pin });

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

export type LiveSource = {
  league: string;
  season: string;
  suffix: string;
  paused: boolean;
  /** ESPN-Liga der Zweitquelle, leer = aus (fehlt bei älteren Einträgen → Standard). */
  backup?: string;
};

export type AdminConfig = {
  liveSource: LiveSource | null;
  defaults: { league: string; season: string; backup?: string };
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
export const testLiveSource = (pin: string, src: Omit<LiveSource, "paused" | "backup">) =>
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
  /** owner = vom Ersteller, admin = vom Team hier, global = vom Team überall */
  bannedBy?: "owner" | "admin" | "global" | null;
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

/* ---------- Sperren überall & Entsperrungsanträge ---------- */

export type UnbanRequest = {
  id: number;
  scope: "group" | "global";
  status: "open" | "accepted" | "rejected";
  groupId: string | null;
  groupName: string | null;
  name: string | null;
  /** Vom Ersteller der Runde für das Mitglied beantragt. */
  byOwner: boolean;
  message: string | null;
  reply: string | null;
  createdAt: string;
  decidedAt: string | null;
  banReason: string | null;
};
export const fetchRequests = (pin: string) =>
  invoke<{ data: UnbanRequest[] }>({ action: "requests", pin });
export const decideRequest = (pin: string, id: number, accept: boolean, reply: string) =>
  invoke({ action: "decide", pin, id, accept, reply });

export type GlobalBan = {
  device: string;
  label: string;
  reason: string | null;
  createdAt: string;
  openRequests: number;
};
export const fetchGlobalBans = (pin: string) =>
  invoke<{ data: GlobalBan[] }>({ action: "global_bans", pin });
export const banGlobal = (pin: string, groupId: string, memberId: string, reason: string) =>
  invoke<{ data: number }>({ action: "ban_global", pin, groupId, memberId, reason });
export const unbanGlobal = (
  pin: string,
  target: { device: string } | { groupId: string; memberId: string },
) => invoke<{ data: number }>({ action: "unban_global", pin, ...target });

export type TeamDeviceState = {
  registered: boolean;
  count: number;
  /** Eingetragene Geräte mit Mitteilungs-Abo (fehlt bei älterer Server-Version). */
  reachable?: number;
  /** Hat dieses Gerät ein Mitteilungs-Abo? (fehlt bei älterer Server-Version) */
  selfPush?: boolean;
  /** Je eingetragenem Gerät die letzte Zustellung (SQL-Update „Zustell-Bestätigung“). */
  devices?: TeamDeviceDelivery[];
};

export type TeamDeviceDelivery = {
  self: boolean;
  push: boolean;
  lastOk: string | null;
  lastFail: string | null;
  lastStatus: number | null;
};

/** Team-Mitteilungen an dieses Gerät: abfragen ("") oder ändern. */
export const teamDevice = (pin: string, deviceId: string, mode: "" | "on" | "off" | "only") =>
  invoke<TeamDeviceState>({ action: "team_device", pin, deviceId, mode });

/* ---------- Team-App: Personensuche, Rundentabelle, Protokoll ---------- */

export type PersonMembership = {
  groupId: string;
  groupName: string;
  code: string;
  memberId: string;
  name: string;
  owner: boolean;
  approved: boolean;
  banned: boolean;
  bannedBy: "owner" | "admin" | "global" | null;
  joinedAt: string;
  tips: number;
};
export type PersonHit = {
  /** Geräte-ID – eine Person = ein Gerät. */
  device: string;
  ban: { label: string; reason: string | null; createdAt: string } | null;
  memberships: PersonMembership[];
  requests: {
    id: number;
    scope: "group" | "global";
    status: "open" | "accepted" | "rejected";
    groupName: string | null;
    message: string | null;
    reply: string | null;
    createdAt: string;
  }[];
};
/** Nach einem Namen über alle Tipprunden suchen (mind. 2 Zeichen). */
export const findPerson = (pin: string, query: string) =>
  invoke<{ data: PersonHit[] }>({ action: "find_person", pin, query });

export type GroupBoard = {
  group: { id: string; code: string; name: string };
  members: {
    id: string;
    name: string;
    isOwner: boolean;
    champion: string | null;
    /** Tipps nur für angepfiffene Spiele – wie die Mitglieder sie sehen. */
    tips: Record<string, { home: number; away: number }>;
  }[];
};
export const fetchGroupBoard = (pin: string, groupId: string) =>
  invoke<{ data: GroupBoard }>({ action: "group_board", pin, groupId });

export type TeamLogRow = {
  id: number;
  at: string;
  action: string;
  detail: string | null;
  device_id: string | null;
};
/** Protokoll der Team-Aktionen; rows = null → SQL-Update fehlt noch. */
export const fetchTeamLog = (pin: string) =>
  invoke<{ rows: TeamLogRow[] | null }>({ action: "team_log", pin });
