/**
 * Edge Function: send-push-reminders
 *
 * Wird jede Minute per pg_cron aufgerufen (siehe Migration). Sendet für alle
 * fälligen Erinnerungen einen Web Push (VAPID). Hat sich die Anstoßzeit seit
 * der letzten Benachrichtigung geändert, wird erneut erinnert.
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
 * Deploy mit --no-verify-jwt; geschützt über den Header x-cron-secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { env, json, preflight } from "../_shared/http.ts";

type Row = {
  device_id: string;
  match_id: string;
  kickoff_utc: string;
  lead_minutes: number;
  title: string;
  notified_for: string | null;
  // Many-to-one-Relation: zur Laufzeit ein Objekt, ohne generierte Typen
  // aber als Array typisiert – daher beides zulassen.
  push_subscriptions: Sub | Sub[] | null;
};
type Sub = { endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const secret = Deno.env.get("CRON_SECRET");
    if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "Nicht erlaubt" }, 401);

    webpush.setVapidDetails(
      env("VAPID_SUBJECT", "mailto:kontakt@kicktime.app"),
      env("VAPID_PUBLIC_KEY"),
      env("VAPID_PRIVATE_KEY"),
    );
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const now = Date.now();
    const { data, error } = await db
      .from("match_alarms")
      .select("device_id, match_id, kickoff_utc, lead_minutes, title, notified_for, push_subscriptions ( endpoint, p256dh, auth )")
      .gte("kickoff_utc", new Date(now).toISOString())
      .lte("kickoff_utc", new Date(now + 31 * 60_000).toISOString());
    if (error) throw error;

    let sent = 0;
    const expired: string[] = [];
    for (const row of (data ?? []) as unknown as Row[]) {
      const kickoff = Date.parse(row.kickoff_utc);
      if (kickoff - now > row.lead_minutes * 60_000) continue;
      if (row.notified_for && Date.parse(row.notified_for) === kickoff) continue;
      const sub = Array.isArray(row.push_subscriptions) ? row.push_subscriptions[0] : row.push_subscriptions;
      if (!sub) continue;
      const minutes = Math.max(1, Math.round((kickoff - now) / 60_000));
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "Gleich geht's los ⚽",
            body: `${row.title} – Anpfiff in ${minutes} Minuten.`,
            url: "/",
            tag: `match-${row.match_id}`,
          }),
          { TTL: 30 * 60 },
        );
        sent++;
        await db
          .from("match_alarms")
          .update({ notified_for: row.kickoff_utc })
          .eq("device_id", row.device_id)
          .eq("match_id", row.match_id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(row.device_id);
        else console.warn("[push] Versand fehlgeschlagen", status);
      }
    }
    if (expired.length > 0) await db.from("push_subscriptions").delete().in("device_id", expired);
    return json({ ok: true, sent, cleaned: expired.length });
  } catch (err) {
    console.error("[push]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});
