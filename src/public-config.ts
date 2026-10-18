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
  supabaseUrl: "https://ddtxgvjxpkucdwexhsjs.supabase.co",
  /** Supabase → Project Settings → API → anon / publishable key */
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdHhndmp4cGt1Y2R3ZXhoc2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyOTIxMTksImV4cCI6MjEwNzg2ODExOX0.4IHaK6un9K7z4wdHmkD86_CV4NJ6ycHj9OkQisrOhIU",
  /** Öffentlicher VAPID-Schlüssel für Web Push */
  vapidPublicKey:
    "BAwssLr5n4lZlvjABX9UfZENwu7iZyFRMh6WixMH6hZHvOvoudivTaBp2u18ZgYZz4vK_DkdNgxcEOKfs57VxA0",
};
