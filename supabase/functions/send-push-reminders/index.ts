/**
 * Edge Function: send-push-reminders
 *
 * Wird von pg_cron (alle 1 Minute) getriggert. Findet alle Match-Alarme,
 * deren Kickoff in <= lead_minutes liegt und noch nicht zugestellt wurden,
 * und sendet pro registriertem Gerät einen VAPID-signierten Web Push.
 *
 * Endpoints, die mit 404/410 antworten, werden entfernt (Browser/Device abgemeldet).
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type AlarmRow = {
  device_id: string;
  match_id: string;
  kickoff_utc: string;
  lead_minutes: number;
  team_a_name: string | null;
  team_b_name: string | null;
  push_subscriptions: {
    endpoint: string;
    p256dh: string;
    auth: string;
  } | null;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@kicktime2026.de";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Supabase env missing" }, 500);
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ error: "VAPID keys missing" }, 500);
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const nowIso = new Date().toISOString();
    const horizonIso = new Date(Date.now() + 20 * 60_000).toISOString();

    // Alle fälligen Alarme inkl. zugehöriger Push-Subscription holen.
    const { data, error } = await supabase
      .from("match_alarm_subscriptions")
      .select(
        "device_id, match_id, kickoff_utc, lead_minutes, team_a_name, team_b_name, push_subscriptions ( endpoint, p256dh, auth )"
      )
      .is("notified_at", null)
      .gte("kickoff_utc", nowIso)
      .lte("kickoff_utc", horizonIso);

    if (error) {
      console.error("[push] select failed", error);
      return json({ error: error.message }, 500);
    }

    const rows = (data ?? []) as AlarmRow[];
    if (rows.length === 0) return json({ ok: true, sent: 0, checked: 0 });

    const dueNow = new Date();
    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];
    const notifiedKeys: Array<{ device_id: string; match_id: string }> = [];

    for (const row of rows) {
      // Nur senden, wenn jetzt innerhalb des Lead-Fensters
      const kickoff = new Date(row.kickoff_utc).getTime();
      const leadMs = (row.lead_minutes ?? 15) * 60_000;
      if (kickoff - dueNow.getTime() > leadMs) continue;
      const sub = row.push_subscriptions;
      if (!sub) continue;

      const minutesLeft = Math.max(
        1,
        Math.round((kickoff - dueNow.getTime()) / 60000)
      );
      const teamA = row.team_a_name ?? "Team A";
      const teamB = row.team_b_name ?? "Team B";
      const payload = JSON.stringify({
        title: "Anpfiff steht bevor! 🏆",
        body: `${teamA} - ${teamB} startet in ${minutesLeft} Minuten!`,
        url: "/",
        tag: `match-${row.match_id}`,
      });

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 30 }
        );
        sent++;
        notifiedKeys.push({ device_id: row.device_id, match_id: row.match_id });
      } catch (err: any) {
        failed++;
        const status = err?.statusCode || err?.status;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          console.warn("[push] send failed", status, err?.body || err?.message);
        }
      }
    }

    // Erfolgreiche Sends markieren
    for (const key of notifiedKeys) {
      await supabase
        .from("match_alarm_subscriptions")
        .update({ notified_at: new Date().toISOString() })
        .eq("device_id", key.device_id)
        .eq("match_id", key.match_id);
    }

    // Tote Endpoints löschen
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return json({
      ok: true,
      checked: rows.length,
      sent,
      failed,
      cleaned: expiredEndpoints.length,
    });
  } catch (err) {
    console.error("[push] fatal", err);
    return json({ error: String(err) }, 500);
  }
});
