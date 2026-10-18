/**
 * Öffentliche Zugangsdaten für das (optionale) Supabase-Backend.
 *
 * Alle drei Werte sind NICHT geheim – sie landen ohnehin in jedem Browser.
 * Geheime Schlüssel (VAPID Private Key, ADMIN_PIN, Service-Role-Key) gehören
 * NIEMALS hierher, sondern nur in die Supabase-Secrets.
 *
 * Leer lassen = App läuft ohne Backend. Umgebungsvariablen (VITE_…) haben
 * Vorrang, falls gesetzt.
 */
export const PUBLIC_CONFIG = {
  /** Supabase → Project Settings → API → Project URL, z. B. "https://abcd.supabase.co" */
  supabaseUrl: "",
  /** Supabase → Project Settings → API → anon / publishable key */
  supabaseAnonKey: "",
  /** Öffentlicher VAPID-Schlüssel für Web Push */
  vapidPublicKey: "",
};
