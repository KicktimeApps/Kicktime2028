import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_CONFIG } from "@/public-config";

/**
 * Supabase ist optional. Ohne Konfiguration läuft die App vollständig lokal
 * (Live-Daten kommen dann direkt von OpenLigaDB). Mit Konfiguration kommen
 * Push-Erinnerungen, Admin-Korrekturen, Telemetrie und Feedback hinzu.
 *
 * Das SDK wird erst bei Bedarf nachgeladen – das hält den Start schlank.
 */
const URL = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PUBLIC_CONFIG.supabaseUrl
).trim();
const KEY = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PUBLIC_CONFIG.supabaseAnonKey
).trim();

let clientPromise: Promise<SupabaseClient> | null = null;

export function isBackendConfigured(): boolean {
  return URL.startsWith("https://") && KEY.length > 20;
}

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!isBackendConfigured()) return null;
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  );
  return clientPromise;
}
