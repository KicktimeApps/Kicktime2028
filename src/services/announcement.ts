import { create } from "zustand";
import { getSupabase } from "./supabase";

/**
 * Hinweis-Banner, den der Admin für alle einblenden kann (app_config
 * „announcement“). Weggeklickte Hinweise merkt sich das Gerät per ID.
 */
export type Announcement = {
  id: number;
  text: string;
  tone: "info" | "warn" | "success";
  until: string | null;
};

const DISMISSED_KEY = "kicktime-2028.dismissed-banner";

function readDismissed(): number | null {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || null;
  } catch {
    return null;
  }
}

export const useAnnouncement = create<{
  current: Announcement | null;
  dismissed: number | null;
  dismiss: () => void;
}>((set, get) => ({
  current: null,
  dismissed: typeof window === "undefined" ? null : readDismissed(),
  dismiss: () => {
    const id = get().current?.id ?? null;
    try {
      if (id) localStorage.setItem(DISMISSED_KEY, String(id));
    } catch {
      /* egal */
    }
    set({ dismissed: id });
  },
}));

let lastFetch = 0;

/** Höchstens alle 5 Minuten (Live-Abrufe laufen bei Spielen jede Minute). */
export async function refreshAnnouncement(force = false): Promise<void> {
  if (!force && Date.now() - lastFetch < 5 * 60_000) return;
  lastFetch = Date.now();
  const sb = await getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from("app_config")
    .select("value")
    .eq("key", "announcement")
    .maybeSingle();
  if (error) return; // SQL-Update fehlt – kein Banner
  const v = (data?.value ?? null) as Announcement | null;
  useAnnouncement.setState({ current: v && typeof v.text === "string" ? v : null });
}

/** Sichtbar, solange nicht abgelaufen und nicht weggeklickt. */
export function visibleAnnouncement(
  a: Announcement | null,
  dismissed: number | null,
  now: number,
): Announcement | null {
  if (!a || a.id === dismissed) return null;
  if (a.until && Date.parse(a.until) < now) return null;
  return a;
}
