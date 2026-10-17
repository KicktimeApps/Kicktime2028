import type { LivePhase, MatchStatus } from "@/domain/types";
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
};
export const fetchStats = (pin: string) => invoke<Stats>({ action: "stats", pin });

export type FeedbackRow = {
  rating: number;
  message: string | null;
  created_at: string;
  app_version: string | null;
};
export const fetchFeedback = (pin: string) =>
  invoke<{ rows: FeedbackRow[] }>({ action: "feedback", pin });
