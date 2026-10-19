/**
 * Edge Function: send-push-reminders
 *
 * Wird jede Minute per pg_cron aufgerufen (siehe Migration). Sendet für alle
 * fälligen Erinnerungen einen Web Push (VAPID). Hat sich die Anstoßzeit seit
 * der letzten Benachrichtigung geändert, wird erneut erinnert. Außerdem gehen
 * Nachrichten der Tipprunden raus (z. B. „Neue Beitrittsanfrage“).
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
 * Deploy mit --no-verify-jwt; geschützt über den Header x-cron-secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// ---------- Helfer (bewusst in dieser Datei, damit sie sich einzeln ins Dashboard kopieren lässt) ----------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function preflight(req: Request): Response | null {
  return req.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: CORS_HEADERS })
    : null;
}

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new Error(`Secret ${name} fehlt`);
  return v;
}

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

type TipPush = Sub & { device_id: string; title: string; body: string; url: string; tag: string };

type Due = {
  device_id: string;
  match_id: string;
  kickoff_utc: string;
  title: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Fällige Erinnerungen holen – bevorzugt atomar über kt_claim_due_alarms. */
// deno-lint-ignore no-explicit-any
type Db = any;

async function claimDue(db: Db, now: number): Promise<{ list: Due[]; atomic: boolean }> {
  const { data, error } = await db.rpc("kt_claim_due_alarms");
  if (!error) return { list: (data ?? []) as Due[], atomic: true };

  // Rückfall ohne SQL-Update „Härtung“: lesen und danach markieren.
  const { data: rows, error: selErr } = await db
    .from("match_alarms")
    .select(
      "device_id, match_id, kickoff_utc, lead_minutes, title, notified_for, push_subscriptions ( endpoint, p256dh, auth )",
    )
    .gte("kickoff_utc", new Date(now).toISOString())
    .lte("kickoff_utc", new Date(now + 61 * 60_000).toISOString());
  if (selErr) throw selErr;
  const list: Due[] = [];
  for (const row of (rows ?? []) as unknown as Row[]) {
    const kickoff = Date.parse(row.kickoff_utc);
    if (kickoff - now > row.lead_minutes * 60_000) continue;
    if (row.notified_for && Date.parse(row.notified_for) === kickoff) continue;
    const sub = Array.isArray(row.push_subscriptions)
      ? row.push_subscriptions[0]
      : row.push_subscriptions;
    if (!sub) continue;
    list.push({ ...row, ...sub });
  }
  return { list, atomic: false };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    // Ohne gesetztes Secret niemals offen – sonst könnte jeder Push auslösen.
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret)
      return json({ error: "Nicht erlaubt" }, 401);

    webpush.setVapidDetails(
      env("VAPID_SUBJECT", "mailto:kontakt@kicktime.app"),
      env("VAPID_PUBLIC_KEY"),
      env("VAPID_PRIVATE_KEY"),
    );
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const now = Date.now();
    const { list, atomic } = await claimDue(db, now);

    let sent = 0;
    const expired = new Set<string>();
    const sendOne = async (row: Due) => {
      const kickoff = Date.parse(row.kickoff_utc);
      const minutes = Math.max(1, Math.round((kickoff - now) / 60_000));
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({
            title: "Gleich geht's los ⚽",
            body: `${row.title} – Anpfiff in ${minutes} Minuten.`,
            url: "/",
            tag: `match-${row.match_id}`,
          }),
          // Nur bis zum Anpfiff zustellen – danach wäre die Nachricht falsch.
          { TTL: Math.max(60, Math.round((kickoff - now) / 1000)), urgency: "high" },
        );
        sent++;
        if (!atomic) {
          await db
            .from("match_alarms")
            .update({ notified_for: row.kickoff_utc })
            .eq("device_id", row.device_id)
            .eq("match_id", row.match_id);
        }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.add(row.device_id);
        else {
          console.warn("[push] Versand fehlgeschlagen", status);
          // Vorübergehender Fehler → beim nächsten Lauf noch einmal versuchen.
          if (atomic && (!status || status === 429 || status >= 500))
            await db.rpc("kt_release_alarm", { p_device: row.device_id, p_match: row.match_id });
        }
      }
    };

    // Parallel, aber begrenzt (10 gleichzeitig) und mit Zeitlimit pro Durchlauf.
    const queue = [...list];
    await Promise.all(
      Array.from({ length: Math.min(10, queue.length) }, async () => {
        for (let row = queue.shift(); row; row = queue.shift()) await sendOne(row);
      }),
    );
    // Tipprunden-Nachrichten (SQL-Update „Push bei Beitrittsanfrage“).
    let tipSent = 0;
    const { data: tipRows, error: tipErr } = await db.rpc("kt_claim_tip_push");
    if (!tipErr) {
      for (const row of (tipRows ?? []) as TipPush[]) {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
            { TTL: 86_400, urgency: "normal" },
          );
          tipSent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) expired.add(row.device_id);
          else console.warn("[push] Tipprunden-Nachricht fehlgeschlagen", status);
        }
      }
    }

    if (expired.size > 0)
      await db
        .from("push_subscriptions")
        .delete()
        .in("device_id", [...expired]);
    return json({ ok: true, sent, due: list.length, tipSent, cleaned: expired.size });
  } catch (err) {
    console.error("[push]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});
