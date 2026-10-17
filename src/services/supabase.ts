import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase ist optional. Ohne Konfiguration läuft die App vollständig lokal
 * (Live-Daten kommen dann direkt von OpenLigaDB). Mit Konfiguration kommen
 * Push-Erinnerungen, Admin-Korrekturen, Telemetrie und Feedback hinzu.
 */
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

let client: SupabaseClient | null = null;

export function isBackendConfigured(): boolean {
  return URL.startsWith("https://") && KEY.length > 20;
}

export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
