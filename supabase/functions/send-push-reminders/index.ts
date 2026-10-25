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

/**
 * Höchstens so viele Erinnerungen (Spiel + Tipp) je Lauf. Supabase erlaubt einer
 * Edge Function 2 s Rechenzeit pro Aufruf; jede Nachricht wird verschlüsselt
 * (gemessen Okt. 2026: ~1 ms, mit zwischengespeicherter VAPID-Signatur). 600 lassen
 * reichlich Reserve. Wird es mehr, geben wir den Rest wieder frei – er geht im
 * nächsten Lauf (eine Minute später) raus, statt bei einem Abbruch verloren zu gehen.
 */
const MAX_REMINDERS_PER_RUN = 600;
/** Rechenzeit (ms) fürs Verschlüsseln je Lauf – danach Rest in den nächsten Lauf. */
const CPU_BUDGET_MS = 1200;

/** VAPID-Signatur je Push-Dienst (Apple, Google …) einmal pro Lauf statt je Nachricht. */
function vapidCache(subject: string, publicKey: string, privateKey: string) {
  const cache = new Map<string, string>();
  return (endpoint: string): Record<string, string> => {
    const audience = new URL(endpoint).origin;
    let auth = cache.get(audience);
    if (!auth) {
      auth = webpush.getVapidHeaders(audience, subject, publicKey, privateKey, "aes128gcm")
        .Authorization as string;
      cache.set(audience, auth);
    }
    return { Authorization: auth };
  };
}

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

    const vapid = {
      subject: env("VAPID_SUBJECT", "mailto:kontakt@kicktime.app"),
      publicKey: env("VAPID_PUBLIC_KEY"),
      privateKey: env("VAPID_PRIVATE_KEY"),
    };
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey); // prüft die Schlüssel
    const signed = vapidCache(vapid.subject, vapid.publicKey, vapid.privateKey);
    // Signatur kommt aus dem Cache – web-push soll sie nicht je Nachricht neu rechnen.
    const pushOpts = (endpoint: string) => ({ headers: signed(endpoint), vapidDetails: null });
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const now = Date.now();
    const { list: claimed, atomic } = await claimDue(db, now);

    // Erinnerungen wieder freigeben – sie gehen im nächsten Lauf raus.
    const releaseAlarms = async (rows: Due[]) => {
      if (!atomic || rows.length === 0) return;
      const byMatch = new Map<string, string[]>();
      for (const r of rows)
        byMatch.set(r.match_id, [...(byMatch.get(r.match_id) ?? []), r.device_id]);
      for (const [match, devices] of byMatch)
        await db
          .from("match_alarms")
          .update({ notified_for: null })
          .eq("match_id", match)
          .in("device_id", devices);
    };
    // Zu viele auf einmal? Den Rest freigeben – kommt im nächsten Lauf.
    const list = claimed.slice(0, MAX_REMINDERS_PER_RUN);
    const laterAlarms = claimed.slice(MAX_REMINDERS_PER_RUN);
    await releaseAlarms(laterAlarms);

    // Sicherung gegen die 2-s-Grenze: Rechenzeit fürs Verschlüsseln mitzählen
    // (läuft synchron beim Aufruf von sendNotification). Ist das Budget erreicht,
    // bleibt der Rest liegen und wird für den nächsten Lauf freigegeben.
    let cpuMs = 0;
    const encrypt = <T>(fn: () => Promise<T>): Promise<T> => {
      const t = performance.now();
      const p = fn();
      cpuMs += performance.now() - t;
      return p;
    };

    let sent = 0;
    const expired = new Set<string>();
    const sendOne = async (row: Due) => {
      const kickoff = Date.parse(row.kickoff_utc);
      const minutes = Math.max(1, Math.round((kickoff - now) / 60_000));
      try {
        await encrypt(() =>
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({
              title: "Gleich geht's los ⚽",
              body: `${row.title} – Anpfiff in ${minutes} Minuten.`,
              url: "/",
              tag: `match-${row.match_id}`,
            }),
            // Nur bis zum Anpfiff zustellen – danach wäre die Nachricht falsch.
            {
              TTL: Math.max(60, Math.round((kickoff - now) / 1000)),
              urgency: "high",
              ...pushOpts(row.endpoint),
            },
          ),
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

    // Parallel, aber begrenzt (20 gleichzeitig – das Warten aufs Netz kostet keine
    // Rechenzeit). Gibt zurück, was wegen des Rechenzeit-Budgets liegen blieb.
    const parallel = async <T>(rows: T[], send: (row: T) => Promise<void>): Promise<T[]> => {
      const queue = [...rows];
      await Promise.all(
        Array.from({ length: Math.min(20, queue.length) }, async () => {
          while (queue.length > 0 && cpuMs < CPU_BUDGET_MS) await send(queue.shift()!);
        }),
      );
      return queue;
    };
    const leftAlarms = await parallel(list, sendOne);
    await releaseAlarms(leftAlarms);

    // Zustell-Bestätigung für Team-Geräte (SQL-Update „Zustell-Bestätigung“):
    // Der Team-Bereich zeigt so, ob Warnungen wirklich bei Apple/Google ankommen.
    const { data: teamRow } = await db
      .from("app_config")
      .select("value")
      .eq("key", "admin_devices")
      .maybeSingle();
    const team = new Set<string>(
      Array.isArray(teamRow?.value?.devices) ? teamRow.value.devices : [],
    );
    const deliveries = new Map<string, { ok: boolean; status: number | null; title: string }>();
    const note = (row: TipPush, ok: boolean, status: number | null) => {
      if (team.has(row.device_id)) deliveries.set(row.device_id, { ok, status, title: row.title });
    };

    /**
     * Nachricht an ein Gerät; abgelaufene Abos merken. Gibt bei vorübergehenden
     * Fehlern (Zeitüberschreitung, 429, 5xx) false zurück.
     */
    const sendMessage = async (row: TipPush, label: string): Promise<boolean | "gone"> => {
      try {
        await encrypt(() =>
          webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
            { TTL: 86_400, urgency: "normal", ...pushOpts(row.endpoint) },
          ),
        );
        note(row, true, null);
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        note(row, false, status ?? 0);
        if (status === 404 || status === 410) {
          expired.add(row.device_id);
          return "gone";
        }
        console.warn(`[push] ${label} fehlgeschlagen`, status);
        return !(!status || status === 429 || status >= 500) ? "gone" : false;
      }
    };

    // Tipprunden-Nachrichten (SQL-Update „Push bei Beitrittsanfrage“).
    // Was liegen bleibt (vorübergehender Fehler, Rechenzeit-Budget), kommt in die
    // Warteschlange der Einzel-Mitteilungen – der nächste Lauf versucht es erneut.
    const retry: (TipPush & { created_at?: string })[] = [];
    let tipSent = 0;
    const { data: tipRows, error: tipErr } = await db.rpc("kt_claim_tip_push");
    if (!tipErr)
      retry.push(
        ...(await parallel((tipRows ?? []) as TipPush[], async (row) => {
          if ((await sendMessage(row, "Tipprunden-Nachricht")) === true) tipSent++;
        })),
      );

    // Einzel-Mitteilungen (Sperren, Entsperrungsanträge, neuer Ersteller).
    let directSent = 0;
    const { data: directRows, error: directErr } = await db.rpc("kt_claim_direct_push");
    if (!directErr)
      retry.push(
        ...(await parallel(
          (directRows ?? []) as (TipPush & { created_at?: string })[],
          async (row) => {
            const res = await sendMessage(row, "Einzel-Mitteilung");
            if (res === true) directSent++;
            else if (res === false) retry.push(row);
          },
        )),
      );
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

    // Tipp-Erinnerung (SQL-Update „Wächter und Tipp-Erinnerung“) – im selben
    // Rahmen wie die Spiel-Erinnerungen; der Rest wird wieder freigegeben.
    let tipReminded = 0;
    let laterTips = 0;
    const { data: remindRows, error: remindErr } = await db.rpc("kt_claim_tip_reminders");
    if (!remindErr) {
      const all = (remindRows ?? []) as (TipPush & { tag: string })[];
      const room = Math.max(0, MAX_REMINDERS_PER_RUN - list.length);
      // Freigeben = Merker „schon erinnert“ löschen, dann kommt sie im nächsten Lauf.
      const releaseTips = async (rows: typeof all) => {
        const byMatch = new Map<string, string[]>();
        // tag = "tipp-<Spiel>" (kt_claim_tip_reminders)
        for (const r of rows) {
          const match = r.tag.replace(/^tipp-/, "");
          byMatch.set(match, [...(byMatch.get(match) ?? []), r.device_id]);
        }
        for (const [match, devices] of byMatch)
          await db
            .from("kt_tip_reminders_sent")
            .delete()
            .eq("match_id", match)
            .in("device_id", devices);
      };
      const later = [
        ...all.slice(room),
        ...(await parallel(all.slice(0, room), async (row) => {
          if ((await sendMessage(row, "Tipp-Erinnerung")) === true) tipReminded++;
        })),
      ];
      laterTips = later.length;
      await releaseTips(later);
    }
    const deferred = (atomic ? laterAlarms.length + leftAlarms.length : 0) + laterTips;

    if (expired.size > 0)
      await db
        .from("push_subscriptions")
        .delete()
        .in("device_id", [...expired]);

    if (deliveries.size > 0) {
      // Getrennt speichern: ein gemeinsames Upsert mit unterschiedlichen Spalten
      // würde fehlende Felder (z. B. last_ok_at bei einem Fehler) leeren.
      const at = new Date().toISOString();
      const all = [...deliveries];
      const ok = all
        .filter(([, d]) => d.ok)
        .map(([device_id, d]) => ({ device_id, last_ok_at: at, last_title: d.title.slice(0, 80) }));
      const failed = all
        .filter(([, d]) => !d.ok)
        .map(([device_id, d]) => ({
          device_id,
          last_fail_at: at,
          last_status: d.status,
          last_title: d.title.slice(0, 80),
        }));
      for (const rows of [ok, failed] as Record<string, unknown>[][]) {
        if (rows.length === 0) continue;
        const { error: delivErr } = await db.from("kt_team_delivery").upsert(rows);
        if (delivErr) console.warn("[zustellung]", delivErr.message); // SQL-Update fehlt
      }
    }

    // Einmal täglich (3:07 UTC): Abos aufräumen, die 60 Tage nicht gemeldet wurden.
    let cleanedOld = 0;
    const clock = new Date(now);
    if (clock.getUTCHours() === 3 && clock.getUTCMinutes() === 7) {
      const { data: n, error: cleanErr } = await db.rpc("kt_push_cleanup");
      if (!cleanErr) cleanedOld = Number(n ?? 0);
    }

    // Wächter: darf den Versand nie stören. Seine Team-Mitteilungen landen in
    // kt_push_queue und gehen beim nächsten Lauf (in einer Minute) raus.
    let watch = "aus";
    try {
      // Staut sich der Versand über mehrere Minuten (sehr viele Nutzer), dem Team
      // Bescheid geben – dann den Versand aufteilen (mehrere Aufrufe je Minute).
      await db.rpc("kt_alert_set", {
        p_key: "push-stau",
        p_active: deferred >= MAX_REMINDERS_PER_RUN,
        p_message: `Mitteilungen stauen sich: ${deferred} Erinnerungen warten auf den nächsten Lauf (höchstens ${MAX_REMINDERS_PER_RUN} pro Minute).`,
      });
      watch = await watchdog(db, now);
    } catch (err) {
      console.warn("[wächter]", err);
      watch = "fehler";
    }
    return json({
      ok: true,
      sent,
      due: claimed.length,
      deferred,
      tipSent,
      directSent,
      tipReminded,
      cleaned: expired.size,
      cleanedOld,
      watch,
    });
  } catch (err) {
    console.error("[push]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});

// ---------------------------------------------------------------- Wächter

type Fixture = {
  match_id: string;
  kickoff_utc: string;
  title?: string | null;
  city?: string | null;
};
type LiveFixture = {
  kickoffUtc?: string;
  status?: string;
  city?: string | null;
  stadium?: string | null;
};

const MIN = 60_000;
/** Ab hier gilt eine Stunde als auffällig (Missbrauch, Skripte). */
const GROUPS_PER_HOUR = 150;
const GROUPS_WITHOUT_APP = 20;
const JOINS_PER_HOUR = 500;
const berlinTime = (t: number) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
/** Kalendertag in Berlin als „2028-06-09“. */
const berlinDay = (t: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(t));

/**
 * Spiele, deren Anstoßzeit bei OpenLigaDB nicht zur Tipp-Sperre (kt_fixtures)
 * passt. Zuordnung über Tag und Spielort (Spalte city, SQL-Update
 * „Gerät vergessen …“); ohne Ort zählt jede Anstoßzeit des Tages.
 * Spiele an Tagen ohne EM-Spiel (andere Liga eingestellt) werden ignoriert.
 */
function kickoffMismatches(fixtures: (Fixture & { t: number })[], list: LiveFixture[]): string[] {
  const off: string[] = [];
  for (const x of list) {
    const t = x.kickoffUtc ? Date.parse(x.kickoffUtc) : NaN;
    if (Number.isNaN(t)) continue;
    const day = berlinDay(t);
    const sameDay = fixtures.filter((f) => berlinDay(f.t) === day);
    if (sameDay.length === 0) continue;
    const place = `${x.city ?? ""} ${x.stadium ?? ""}`.toLowerCase();
    const here = sameDay.filter((f) => f.city && place.includes(f.city.toLowerCase()));
    const candidates = here.length > 0 ? here : sameDay;
    if (candidates.some((f) => Math.abs(f.t - t) <= 5 * MIN)) continue;
    const ours = candidates.map((f) => berlinTime(f.t)).join("/");
    off.push(
      `${day.slice(8, 10)}.${day.slice(5, 7)}.${x.city ? ` in ${x.city}` : ""}: OpenLigaDB ${berlinTime(t)}, Tipp-Sperre ${ours} Uhr`,
    );
  }
  return off;
}

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
      espn: "Die Zweitquelle ESPN macht auf den Geräten Probleme",
      backend: "Die App erreicht die Live-Daten des Servers nicht",
    };
    for (const src of ["espn", "backend"]) {
      const r = rows.find((x) => x.source === src);
      // Ab 2 Geräten oder wenn ein Gerät 15 Minuten lang immer wieder Fehler hat.
      const bad = !!r && (r.devices >= 2 || r.reports >= 3);
      // Den Text der Geräte nie ungeprüft weitergeben (er kommt von außen) –
      // nur einen HTTP-Fehlercode daraus übernehmen.
      const code = r?.last_detail?.match(/\b([1-5]\d\d)\b/)?.[1];
      await alert(
        `quelle-${src}`,
        bad,
        bad
          ? `${label[src]}${code ? ` (Fehler ${code})` : ""} – ${r!.devices} Gerät${r!.devices === 1 ? "" : "e"}, letzte 15 Min.`
          : "",
      );
    }
  }

  // Missbrauch: Geräte-IDs kosten nichts – auffällig viele neue Runden oder
  // Beitrittsanfragen melden (alle 10 Minuten, Blick auf die letzte Stunde).
  if (minute % 10 === 5) {
    const hourAgo = new Date(now - 60 * MIN).toISOString();
    const { data: groups } = await db
      .from("tip_groups")
      .select("owner_device")
      .gte("created_at", hourAgo)
      .limit(1000);
    const owners = [
      ...new Set(((groups ?? []) as { owner_device: string }[]).map((g) => g.owner_device)),
    ];
    // Runden von Geräten, die die App nie benutzt haben (kein Ping) – typisch für Skripte.
    const { count: seen } = owners.length
      ? await db
          .from("app_pings")
          .select("client_id", { count: "exact", head: true })
          .in("client_id", owners.slice(0, 300))
      : { count: 0 };
    const unseen = Math.min(owners.length, 300) - (seen ?? 0);
    const n = groups?.length ?? 0;
    await alert(
      "auffaellig-runden",
      n >= GROUPS_PER_HOUR || unseen >= GROUPS_WITHOUT_APP,
      `Auffällig viele neue Tipprunden: ${n} in der letzten Stunde (${unseen} Geräte ohne App-Nutzung). Bitte im Team-Bereich → Tipprunden prüfen.`,
    );
    const { count: joins } = await db
      .from("tip_members")
      .select("member_id", { count: "exact", head: true })
      .gte("joined_at", hourAgo);
    await alert(
      "auffaellig-anfragen",
      (joins ?? 0) >= JOINS_PER_HOUR,
      `Auffällig viele Beitritte/Anfragen: ${joins} in der letzten Stunde. Bitte im Team-Bereich → Tipprunden prüfen.`,
    );
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
  // Die Tipp-Sperre des Servers richtet sich nach kt_fixtures. Weichen die
  // Zeiten von OpenLigaDB ab, könnte man zu lange (oder zu kurz) tippen.
  const off = kickoffMismatches(fixtures, list);
  await alert(
    "anstosszeiten",
    off.length > 0,
    // Wichtigstes zuerst – die Mitteilung zeigt nur die ersten 200 Zeichen.
    `Bitte im Team-Bereich → Live-Daten „Anstoßzeiten abgleichen“: Die Tipp-Sperre nutzt bei ${off.length} Spiel${off.length === 1 ? "" : "en"} eine andere Zeit als OpenLigaDB (${off.slice(0, 2).join("; ")}${off.length > 2 ? " …" : ""}).`,
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
