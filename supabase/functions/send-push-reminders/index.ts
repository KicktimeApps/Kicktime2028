/**
 * Edge Function: send-push-reminders
 *
 * Wird jede Minute per pg_cron aufgerufen (siehe Migration). Sendet für alle
 * fälligen Erinnerungen einen Web Push (VAPID). Hat sich die Anstoßzeit seit
 * der letzten Benachrichtigung geändert, wird erneut erinnert. Außerdem gehen
 * Nachrichten der Tipprunden raus (z. B. „Neue Beitrittsanfrage“) und die
 * Tipp-Erinnerung („Noch kein Tipp“, eine Stunde vor Anpfiff).
 *
 * Wächter: prüft rund um Spiele, ob Live-Daten ankommen (OpenLigaDB über
 * live-scores, Meldungen der Geräte zu ESPN/Server), und meldet Probleme und
 * deren Behebung dem KickTime-Team (kt_alert_set → kt_push_team).
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
 * Deploy mit --no-verify-jwt; geschützt über den Header x-cron-secret.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
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

    // Parallel, aber begrenzt (10 gleichzeitig).
    const parallel = async <T>(rows: T[], send: (row: T) => Promise<void>) => {
      const queue = [...rows];
      await Promise.all(
        Array.from({ length: Math.min(10, queue.length) }, async () => {
          for (let row = queue.shift(); row; row = queue.shift()) await send(row);
        }),
      );
    };
    await parallel(list, sendOne);

    /**
     * Nachricht an ein Gerät; abgelaufene Abos merken. Gibt bei vorübergehenden
     * Fehlern (Zeitüberschreitung, 429, 5xx) false zurück.
     */
    const sendMessage = async (row: TipPush, label: string): Promise<boolean | "gone"> => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
          { TTL: 86_400, urgency: "normal" },
        );
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expired.add(row.device_id);
          return "gone";
        }
        console.warn(`[push] ${label} fehlgeschlagen`, status);
        return !(!status || status === 429 || status >= 500) ? "gone" : false;
      }
    };

    // Tipprunden-Nachrichten (SQL-Update „Push bei Beitrittsanfrage“).
    let tipSent = 0;
    const { data: tipRows, error: tipErr } = await db.rpc("kt_claim_tip_push");
    if (!tipErr)
      await parallel((tipRows ?? []) as TipPush[], async (row) => {
        if ((await sendMessage(row, "Tipprunden-Nachricht")) === true) tipSent++;
      });

    // Einzel-Mitteilungen (Sperren, Entsperrungsanträge, neuer Ersteller).
    // Vorübergehender Fehler → zurück in die Warteschlange, nächster Lauf versucht es erneut.
    let directSent = 0;
    const retry: (TipPush & { created_at?: string })[] = [];
    const { data: directRows, error: directErr } = await db.rpc("kt_claim_direct_push");
    if (!directErr)
      await parallel((directRows ?? []) as (TipPush & { created_at?: string })[], async (row) => {
        const res = await sendMessage(row, "Einzel-Mitteilung");
        if (res === true) directSent++;
        else if (res === false) retry.push(row);
      });
    if (retry.length > 0)
      await db.from("kt_push_queue").insert(
        retry.map((r) => ({
          device_id: r.device_id,
          title: r.title,
          body: r.body,
          url: r.url,
          tag: r.tag,
          // ursprünglicher Zeitpunkt: nach einem Tag verfällt die Nachricht trotzdem
          ...(r.created_at ? { created_at: r.created_at } : {}),
        })),
      );

    // Tipp-Erinnerung (SQL-Update „Wächter und Tipp-Erinnerung“).
    let tipReminded = 0;
    const { data: remindRows, error: remindErr } = await db.rpc("kt_claim_tip_reminders");
    if (!remindErr)
      await parallel((remindRows ?? []) as TipPush[], async (row) => {
        if ((await sendMessage(row, "Tipp-Erinnerung")) === true) tipReminded++;
      });

    if (expired.size > 0)
      await db
        .from("push_subscriptions")
        .delete()
        .in("device_id", [...expired]);

    // Wächter: darf den Versand nie stören. Seine Team-Mitteilungen landen in
    // kt_push_queue und gehen beim nächsten Lauf (in einer Minute) raus.
    let watch = "aus";
    try {
      watch = await watchdog(db, now);
    } catch (err) {
      console.warn("[wächter]", err);
      watch = "fehler";
    }
    return json({
      ok: true,
      sent,
      due: list.length,
      tipSent,
      directSent,
      tipReminded,
      cleaned: expired.size,
      watch,
    });
  } catch (err) {
    console.error("[push]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});

// ---------------------------------------------------------------- Wächter

type Fixture = { match_id: string; kickoff_utc: string; title?: string | null };
type LiveFixture = { kickoffUtc?: string; status?: string };

const MIN = 60_000;
const berlinTime = (t: number) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));

/**
 * Prüft die Live-Daten und meldet Probleme ans KickTime-Team. Rund um Spiele
 * alle 2 Minuten, vor dem Turnier einmal täglich. Gibt eine kurze Zusammenfassung
 * für die Protokolle zurück.
 */
async function watchdog(db: Db, now: number): Promise<string> {
  const alert = async (key: string, active: boolean, message = "") => {
    const { error } = await db.rpc("kt_alert_set", {
      p_key: key,
      p_active: active,
      p_message: message,
    });
    if (error) throw new Error(`kt_alert_set: ${error.message}`);
  };
  // Ohne SQL-Update gibt es den Wächter noch nicht.
  const { error: tidyErr } = await db.rpc("kt_alerts_tidy");
  if (tidyErr) return "nicht eingerichtet";

  const minute = new Date(now).getUTCMinutes();
  const { data: fx } = await db.from("kt_fixtures").select("*");
  const fixtures = ((fx ?? []) as Fixture[])
    .map((f) => ({ ...f, t: Date.parse(f.kickoff_utc) }))
    .filter((f) => !Number.isNaN(f.t));
  if (fixtures.length === 0) return "keine Anstoßzeiten";
  const opener = Math.min(...fixtures.map((f) => f.t));
  const last = Math.max(...fixtures.map((f) => f.t));
  // Rund um Spiele: von 5 Min. vor Anpfiff bis 4 Std. danach.
  const around = fixtures.filter((f) => now >= f.t - 5 * MIN && now <= f.t + 240 * MIN);
  const beforeTournament = now >= opener - 21 * 24 * 60 * MIN && now < opener;
  const dailyCheck = beforeTournament && new Date(now).getUTCHours() === 8 && minute === 0;

  // Meldungen der Geräte (ESPN, Server) – alle 2 Minuten.
  if (minute % 2 === 0) {
    const { data: sum } = await db.rpc("kt_source_summary");
    const rows = (sum ?? []) as {
      source: string;
      devices: number;
      reports: number;
      last_detail: string | null;
    }[];
    const label: Record<string, string> = {
      espn: "Zweitquelle ESPN",
      backend: "Die App erreicht die Live-Daten des Servers nicht",
    };
    for (const src of ["espn", "backend"]) {
      const r = rows.find((x) => x.source === src);
      // Ab 2 Geräten oder wenn ein Gerät 15 Minuten lang immer wieder Fehler hat.
      const bad = !!r && (r.devices >= 2 || r.reports >= 3);
      await alert(
        `quelle-${src}`,
        bad,
        bad
          ? `${label[src]}: ${r!.last_detail ?? "Fehler"} (${r!.devices} Gerät${r!.devices === 1 ? "" : "e"}, letzte 15 Min.)`
          : "",
      );
    }
  }

  if ((around.length === 0 || minute % 2 !== 0) && !dailyCheck) return "ruhig";
  if (now > last + 240 * MIN && !dailyCheck) return "Turnier vorbei";

  // Eigene Live-Daten-Funktion abfragen (aktualisiert dabei auch den Cache).
  let body: { fixtures?: LiveFixture[]; cache?: string; url?: string; warning?: string } | null =
    null;
  let failure = "";
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/live-scores`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Wie die App: öffentlicher Schlüssel (falls vorhanden).
        ...(Deno.env.get("SUPABASE_ANON_KEY")
          ? {
              apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
              authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            }
          : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) failure = `antwortet mit Fehler ${res.status}`;
    else body = await res.json();
  } catch (err) {
    failure = `antwortet nicht (${err instanceof Error ? err.name : "Fehler"})`;
  }
  await alert("server", !!failure, `Die Live-Daten-Funktion des Servers ${failure}.`);
  if (!body) return "server: " + failure;

  const list = Array.isArray(body.fixtures) ? body.fixtures : [];
  await alert(
    "pausiert",
    body.cache === "paused" && around.length > 0,
    "Der Live-Abruf ist im Team-Bereich angehalten – es kommen keine neuen Spielstände.",
  );
  await alert(
    "openligadb",
    body.cache === "stale",
    `OpenLigaDB ist nicht erreichbar (${body.warning ?? "Fehler"}). Die App zeigt den letzten Stand.`,
  );
  await alert(
    "liga-leer",
    list.length === 0,
    `OpenLigaDB liefert für ${body.url ?? "die eingestellte Liga"} keine Spiele. Bitte im Team-Bereich → Live-Daten prüfen und ggf. das Kürzel umstellen.`,
  );
  if (dailyCheck || list.length === 0) return `geprüft: ${list.length} Spiele`;

  // Je Anstoßzeit: Laufende Spiele müssen in OpenLigaDB stehen, beendete
  // spätestens 2½ Std. nach Ende abgeschlossen sein (sonst keine Tipp-Punkte).
  const near = (f: { t: number }, x: LiveFixture) =>
    !!x.kickoffUtc && Math.abs(Date.parse(x.kickoffUtc) - f.t) <= 30 * MIN;
  const slots = new Map<number, typeof fixtures>();
  for (const f of around) slots.set(f.t, [...(slots.get(f.t) ?? []), f]);
  for (const [t, group] of slots) {
    const key = `spiel-${group.map((g) => g.match_id).join("-")}`;
    const names = group.map((g) => g.title || `Spiel ${g.match_id.replace(/^m0?/, "")}`).join(", ");
    const found = list.filter((x) => near({ t }, x));
    const running = now >= t + 10 * MIN && now <= t + 150 * MIN;
    const overdue = now >= t + 160 * MIN;
    if (running) {
      const seen = found.filter((x) => x.status === "live" || x.status === "finished").length;
      await alert(
        key,
        seen < group.length,
        `OpenLigaDB meldet ${names} (Anpfiff ${berlinTime(t)} Uhr) nicht als laufend – Spielstände fehlen. Ggf. im Team-Bereich → Korrektur eintragen.`,
      );
    } else if (overdue) {
      const done = found.filter((x) => x.status === "finished").length;
      await alert(
        key,
        done < group.length,
        `${names} (Anpfiff ${berlinTime(t)} Uhr) ist bei OpenLigaDB noch nicht abgeschlossen – Tipp-Punkte gibt es erst danach. Ggf. im Team-Bereich → Korrektur eintragen.`,
      );
    }
  }
  return `geprüft: ${around.length} Spiel(e) rund um jetzt`;
}
