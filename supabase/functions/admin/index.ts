/**
 * Edge Function: admin
 *
 * Einziger Schreibweg für Admin-Korrekturen + Statistik/Feedback-Abfrage.
 * Die PIN liegt nur als Secret ADMIN_PIN auf dem Server. Brute-Force-Schutz:
 * nach 5 Fehlversuchen pro IP (bzw. 30 insgesamt) ist der Zugang 15 Minuten gesperrt.
 *
 * Aktionen:
 *  verify | set | clear | clear_overrides | stats | feedback | feedback_delete | fixtures
 *  config | set_source | test_source | clear_cache | reset_results | set_announcement | broadcast
 *  groups | group | group_delete | member_remove | member_unban | owner_transfer | delete_tip_groups
 *  requests | decide | ban_global | unban_global | global_bans | team_device
 *  alerts | alert_test   (Wächter: Probleme der Live-Daten, Test-Mitteilung)
 *
 * Für „broadcast“ (Push an alle) dieselben Secrets wie send-push-reminders:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
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

/** Welche dieser Geräte ein Mitteilungs-Abo haben (nur an die kommt etwas an). */
// deno-lint-ignore no-explicit-any
async function withPush(db: any, devices: string[]): Promise<Set<string>> {
  if (devices.length === 0) return new Set();
  const { data } = await db.from("push_subscriptions").select("device_id").in("device_id", devices);
  return new Set(((data ?? []) as { device_id: string }[]).map((r) => r.device_id));
}

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new Error(`Secret ${name} fehlt`);
  return v;
}

const MAX_FAILURES = 5;
const MAX_GLOBAL_FAILURES = 30;
const LOCK_MS = 15 * 60_000;
const STATUSES = ["scheduled", "live", "finished"];
const PHASES = ["first", "half", "second", "extra", "penalties"];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  let db;
  let pin: string;
  try {
    db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    pin = env("ADMIN_PIN");
  } catch {
    return json({ error: "Nicht konfiguriert" }, 500);
  }

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Ungültige Anfrage" }, 400);

  // ---- Brute-Force-Schutz ----
  // Pro IP 5 Fehlversuche / 15 min. Da Header gefälscht werden können, gilt
  // zusätzlich eine globale Obergrenze (30 / 15 min) – damit ist Durchprobieren
  // einer 6-stelligen PIN praktisch ausgeschlossen.
  const ip = (req.headers.get("x-forwarded-for") ?? "unbekannt").split(",")[0].trim();
  const keys = [
    { key: `ip:${ip}`, max: MAX_FAILURES },
    { key: "global", max: MAX_GLOBAL_FAILURES },
  ];
  const keyNames = keys.map((k) => k.key);
  const provided = String(body.pin ?? "");

  // Bevorzugt: atomar hochzählen, BEVOR die PIN geprüft wird (SQL-Update
  // „Härtung“). So hilft auch das gleichzeitige Senden vieler Anfragen nicht.
  const { data: counted, error: rpcError } = await db.rpc("kt_admin_attempt", {
    p_keys: keyNames,
  });
  if (!rpcError) {
    const rows = (counted ?? []) as { r_key: string; r_failures: number }[];
    const over = keys.some(
      ({ key, max }) => (rows.find((r) => r.r_key === key)?.r_failures ?? 0) > max,
    );
    if (over) return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
    if (!safeEqual(provided, pin)) return json({ error: "Falsche PIN" }, 401);
    await db.rpc("kt_admin_ok", { p_keys: keyNames });
  } else {
    // Rückfall ohne SQL-Update: lesen, prüfen, schreiben (nicht atomar).
    const { data: attempts } = await db
      .from("admin_attempts")
      .select("key, failures, window_start")
      .in("key", keyNames);
    const active = (k: string) => {
      const a = (attempts ?? []).find((x: { key: string }) => x.key === k);
      return a && Date.now() - Date.parse(a.window_start) < LOCK_MS ? a : null;
    };
    if (keys.some(({ key, max }) => (active(key)?.failures ?? 0) >= max)) {
      return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
    }
    if (!safeEqual(provided, pin)) {
      await db.from("admin_attempts").upsert(
        keys.map(({ key }) => {
          const a = active(key);
          return {
            key,
            failures: a ? a.failures + 1 : 1,
            window_start: a ? a.window_start : new Date().toISOString(),
          };
        }),
      );
      return json({ error: "Falsche PIN" }, 401);
    }
    if (active(`ip:${ip}`)) await db.from("admin_attempts").delete().eq("key", `ip:${ip}`);
  }

  const matchId = String(body.matchId ?? "");
  const validId = /^m\d{2}$/.test(matchId);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const groupId = String(body.groupId ?? "");
  const memberId = String(body.memberId ?? "");
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (!error) return json({ ok: true, data });
    // Funktion fehlt → SQL-Update; „not found“ → schon erledigt/weg; sonst echte Meldung.
    if (error.code === "PGRST202" || /does not exist|could not find/i.test(error.message))
      return json({ error: "Server-Funktion fehlt – SQL-Updates ausgeführt?" }, 500);
    if (error.message.includes("not found"))
      return json({ error: "Nicht (mehr) vorhanden – vielleicht schon erledigt." }, 404);
    return json({ error: `Fehlgeschlagen: ${error.message}` }, 500);
  };

  switch (body.action) {
    case "verify":
      return json({ ok: true });

    case "set": {
      if (!validId || !STATUSES.includes(body.status))
        return json({ error: "Ungültige Daten" }, 400);
      const row = {
        match_id: matchId,
        status: body.status,
        score_home: clampInt(body.scoreHome, 0, 50) ?? 0,
        score_away: clampInt(body.scoreAway, 0, 50) ?? 0,
        pens_home: body.pensHome == null ? null : clampInt(body.pensHome, 0, 50),
        pens_away: body.pensAway == null ? null : clampInt(body.pensAway, 0, 50),
        phase: PHASES.includes(body.phase) ? body.phase : null,
        updated_at: new Date().toISOString(),
        // Stand der Live-Quelle beim Speichern: Ändert sie sich danach, gilt
        // wieder die Quelle (die Korrektur überbrückt nur).
        source_sig: typeof body.sourceSig === "string" ? body.sourceSig.slice(0, 100) : null,
      };
      let { error } = await db.from("match_overrides").upsert(row);
      if (error) {
        // Spalte source_sig noch nicht angelegt (SQL-Update fehlt) → ohne speichern.
        const { source_sig: _unused, ...legacy } = row;
        ({ error } = await db.from("match_overrides").upsert(legacy));
      }
      return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, row });
    }

    case "clear": {
      if (!validId) return json({ error: "Ungültige Daten" }, 400);
      const { error } = await db.from("match_overrides").delete().eq("match_id", matchId);
      return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
    }

    case "stats": {
      const since = (ms: number) => new Date(Date.now() - ms).toISOString();
      // Push-Zustand: anstehende und in 24 h verschickte Erinnerungen.
      const head = { count: "exact" as const, head: true };
      const pushCounts = () =>
        Promise.all([
          db
            .from("match_alarms")
            .select("device_id", head)
            .gt("kickoff_utc", new Date().toISOString()),
          db
            .from("match_alarms")
            .select("device_id", head)
            .gte("notified_for", since(86_400_000))
            .lte("notified_for", new Date(Date.now() + 3_600_000).toISOString()),
        ]);
      // Ausführliche Statistik (SQL-Update „Admin-Ausbau“) enthält schon alles Übrige.
      const { data: ext } = await db.rpc("kt_admin_stats");
      if (ext) {
        const [upcoming, sent24h] = await pushCounts();
        return json({
          online: ext.online,
          day: ext.day,
          week: ext.week,
          total: ext.total,
          topTeams: ext.topTeams,
          push: {
            subscriptions: ext.subscriptions,
            upcoming: upcoming.count ?? 0,
            sent24h: sent24h.count ?? 0,
          },
          ext,
        });
      }
      const count = async (from?: string) => {
        let q = db.from("app_pings").select("client_id", { count: "exact", head: true });
        if (from) q = q.gte("last_ping", from);
        const { count } = await q;
        return count ?? 0;
      };
      const [online, day, week, total] = await Promise.all([
        count(since(10 * 60_000)),
        count(since(86_400_000)),
        count(since(7 * 86_400_000)),
        count(),
      ]);
      const { data: favs } = await db
        .from("app_pings")
        .select("fav_team")
        .not("fav_team", "is", null)
        .limit(5000);
      const tally = new Map<string, number>();
      for (const r of favs ?? []) tally.set(r.fav_team, (tally.get(r.fav_team) ?? 0) + 1);
      const topTeams = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([team, count]) => ({ team, count }));
      const [subs, [upcoming, sent24h]] = await Promise.all([
        db.from("push_subscriptions").select("device_id", head),
        pushCounts(),
      ]);
      const push = {
        subscriptions: subs.count ?? 0,
        upcoming: upcoming.count ?? 0,
        sent24h: sent24h.count ?? 0,
      };
      return json({ online, day, week, total, topTeams, push, ext: null });
    }

    // Anstoßzeiten für die Tipprunden-Sperre (kt_fixtures) aus der App übernehmen.
    case "fixtures": {
      const list = Array.isArray(body.fixtures) ? body.fixtures.slice(0, 60) : [];
      const rows = list
        .filter(
          (f: { matchId?: string; kickoffUtc?: string }) =>
            /^m\d{2}$/.test(String(f.matchId)) && !Number.isNaN(Date.parse(String(f.kickoffUtc))),
        )
        .map((f: { matchId: string; kickoffUtc: string; title?: unknown }) => ({
          match_id: f.matchId,
          kickoff_utc: new Date(f.kickoffUtc).toISOString(),
          // Paarung für die Tipp-Erinnerung („Deutschland – Schottland“), sonst leer.
          title: typeof f.title === "string" ? f.title.trim().slice(0, 80) || null : null,
        }));
      if (rows.length === 0) return json({ error: "Keine gültigen Anstoßzeiten" }, 400);
      let { error } = await db.from("kt_fixtures").upsert(rows);
      if (error) {
        // Spalte title noch nicht angelegt (SQL-Update fehlt) → ohne speichern.
        ({ error } = await db
          .from("kt_fixtures")
          .upsert(rows.map(({ title: _t, ...r }: { title: string | null }) => r)));
      }
      return error
        ? json({ error: "Speichern fehlgeschlagen (SQL-Update Tipprunde ausgeführt?)" }, 500)
        : json({ ok: true, count: rows.length });
    }

    case "feedback": {
      const { data } = await db
        .from("app_feedback")
        .select("id, rating, message, created_at, app_version, category")
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ rows: data ?? [] });
    }

    // Alle Tipprunden löschen (zum Aufräumen nach dem Testen).
    case "delete_tip_groups": {
      const { data, error } = await db.rpc("kt_admin_delete_tip_groups");
      if (!error) return json({ ok: true, count: data ?? 0 });
      // Rückfall ohne SQL-Update: direkt löschen (Mitglieder/Tipps fallen mit).
      const { error: delErr, count } = await db
        .from("tip_groups")
        .delete({ count: "exact" })
        .not("id", "is", null);
      return delErr
        ? json({ error: "Löschen fehlgeschlagen" }, 500)
        : json({ ok: true, count: count ?? 0 });
    }

    case "feedback_delete": {
      const q = db.from("app_feedback").delete();
      const { error } =
        body.id === "all" ? await q.not("id", "is", null) : await q.eq("id", Number(body.id));
      return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
    }

    case "clear_overrides": {
      const { error, count } = await db
        .from("match_overrides")
        .delete({ count: "exact" })
        .not("match_id", "is", null);
      return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true, count });
    }

    // ---- Live-Quelle & Einstellungen ----

    case "config": {
      const { data, error } = await db.from("app_config").select("key, value, updated_at");
      if (error) return json({ error: "SQL-Update „Admin-Ausbau“ fehlt noch" }, 500);
      const get = (k: string) => data?.find((r: { key: string }) => r.key === k) ?? null;
      const { data: cache } = await db.from("live_cache").select("id, fetched_at");
      const { count: stored } = await db
        .from("match_results")
        .select("external_id", { count: "exact", head: true });
      return json({
        liveSource: get("live_source")?.value ?? null,
        defaults: {
          league: Deno.env.get("OPENLIGA_LEAGUE") ?? "em",
          season: Deno.env.get("OPENLIGA_SEASON") ?? "2028",
          backup: "uefa.euro",
        },
        announcement: get("announcement")?.value ?? null,
        cache: cache ?? [],
        storedResults: stored ?? 0,
      });
    }

    case "set_source":
    case "test_source": {
      const league = String(body.league ?? "")
        .trim()
        .toLowerCase();
      const season = String(body.season ?? "").trim();
      const suffix = String(body.suffix ?? "").trim();
      // Zweitquelle ESPN: Liga-Kürzel wie „uefa.euro“, leer = aus.
      const backup = String(body.backup ?? "")
        .trim()
        .toLowerCase();
      if (
        !/^[a-z0-9_]{1,30}$/.test(league) ||
        !/^\d{4}$/.test(season) ||
        !/^(\d{1,3})?$/.test(suffix) ||
        !/^([a-z0-9]{2,12}(\.[a-z0-9_]{1,20})?)?$/.test(backup)
      )
        return json(
          {
            error:
              "Liga (Buchstaben/Zahlen), Saison (4 Ziffern), Endung (Zahl) und ESPN-Liga (z. B. uefa.euro) prüfen",
          },
          400,
        );
      const url = `https://api.openligadb.de/getmatchdata/${league}/${season}${suffix ? `/${suffix}` : ""}`;
      if (body.action === "set_source") {
        const value = { league, season, suffix, paused: body.paused === true, backup };
        const { error } = await db
          .from("app_config")
          .upsert({ key: "live_source", value, updated_at: new Date().toISOString() });
        return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, url });
      }
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return json({ ok: true, url, status: res.status, count: 0 });
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : [];
        type M = {
          matchDateTimeUTC?: string;
          matchIsFinished?: boolean;
          team1?: { teamName?: string };
          team2?: { teamName?: string };
        };
        const times = list
          .map((m: M) => Date.parse(String(m.matchDateTimeUTC)))
          .filter((t: number) => !Number.isNaN(t))
          .sort((a: number, b: number) => a - b);
        return json({
          ok: true,
          url,
          status: res.status,
          count: list.length,
          finished: list.filter((m: M) => m.matchIsFinished).length,
          from: times.length ? new Date(times[0]).toISOString() : null,
          to: times.length ? new Date(times[times.length - 1]).toISOString() : null,
          sample: list
            .slice(0, 3)
            .map((m: M) => `${m.team1?.teamName ?? "?"} – ${m.team2?.teamName ?? "?"}`),
        });
      } catch (err) {
        return json({ ok: true, url, status: 0, count: 0, error: String(err) });
      }
    }

    case "clear_cache": {
      const { error } = await db.from("live_cache").delete().not("id", "is", null);
      return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
    }

    // Gespeicherte Endergebnisse verwerfen (z. B. nach einem Test mit einer anderen Liga).
    case "reset_results": {
      const { error, count } = await db
        .from("match_results")
        .delete({ count: "exact" })
        .not("external_id", "is", null);
      await db.from("live_cache").delete().not("id", "is", null);
      return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true, count });
    }

    case "set_announcement": {
      const text = String(body.text ?? "")
        .trim()
        .slice(0, 280);
      if (!text) {
        const { error } = await db.from("app_config").delete().eq("key", "announcement");
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
      }
      const until =
        body.until && !Number.isNaN(Date.parse(String(body.until)))
          ? new Date(String(body.until)).toISOString()
          : null;
      const value = {
        id: Date.now(),
        text,
        tone: ["info", "warn", "success"].includes(body.tone) ? body.tone : "info",
        until,
      };
      const { error } = await db
        .from("app_config")
        .upsert({ key: "announcement", value, updated_at: new Date().toISOString() });
      return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, value });
    }

    // Push an alle Abonnenten – oder nur an ein Gerät (Test).
    case "broadcast": {
      const title = String(body.title ?? "")
        .trim()
        .slice(0, 60);
      const text = String(body.body ?? "")
        .trim()
        .slice(0, 180);
      const url = /^\/[\w\-/?=&.]*$/.test(String(body.url ?? "")) ? String(body.url) : "/";
      if (!title || !text) return json({ error: "Titel und Text angeben" }, 400);
      try {
        webpush.setVapidDetails(
          env("VAPID_SUBJECT", "mailto:kontakt@kicktime.app"),
          env("VAPID_PUBLIC_KEY"),
          env("VAPID_PRIVATE_KEY"),
        );
      } catch {
        return json({ error: "VAPID-Secrets fehlen" }, 500);
      }
      let q = db.from("push_subscriptions").select("device_id, endpoint, p256dh, auth");
      if (body.onlyDevice) {
        if (!UUID.test(String(body.onlyDevice))) return json({ error: "Ungültiges Gerät" }, 400);
        q = q.eq("device_id", String(body.onlyDevice));
      }
      const { data: subs, error } = await q.limit(5000);
      if (error) return json({ error: "Abos nicht lesbar" }, 500);
      type Sub = { device_id: string; endpoint: string; p256dh: string; auth: string };
      const queue = [...((subs ?? []) as Sub[])];
      const payload = JSON.stringify({ title, body: text, url, tag: `admin-${Date.now()}` });
      let sent = 0;
      let failed = 0;
      const expired: string[] = [];
      await Promise.all(
        Array.from({ length: Math.min(10, queue.length) }, async () => {
          for (let s = queue.shift(); s; s = queue.shift()) {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 6 * 3600, urgency: "normal" },
              );
              sent++;
            } catch (err) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) expired.push(s.device_id);
              else failed++;
            }
          }
        }),
      );
      if (expired.length > 0) await db.from("push_subscriptions").delete().in("device_id", expired);
      return json({ ok: true, total: subs?.length ?? 0, sent, failed, cleaned: expired.length });
    }

    // ---- Tipprunden verwalten ----

    case "groups":
      return rpc("kt_admin_groups");

    case "group":
      if (!UUID.test(groupId)) return json({ error: "Ungültige Runde" }, 400);
      return rpc("kt_admin_group", { p_group: groupId });

    case "group_delete":
      if (!UUID.test(groupId)) return json({ error: "Ungültige Runde" }, 400);
      return rpc("kt_admin_delete_group", { p_group: groupId });

    case "member_remove":
      if (!UUID.test(groupId) || !UUID.test(memberId))
        return json({ error: "Ungültige Daten" }, 400);
      return rpc("kt_admin_remove_member", {
        p_group: groupId,
        p_member: memberId,
        p_ban: body.ban === true,
      });

    case "member_unban": {
      if (!UUID.test(groupId) || !UUID.test(memberId))
        return json({ error: "Ungültige Daten" }, 400);
      const { error } = await db.rpc("kt_admin_unban", { p_group: groupId, p_member: memberId });
      if (error?.message.includes("global"))
        return json({ error: "Überall gesperrt – unter „Anträge“ überall entsperren." }, 400);
      return error ? json({ error: "Fehlgeschlagen" }, 500) : json({ ok: true });
    }

    // ---- Sperren überall & Entsperrungsanträge ----

    case "requests":
      return rpc("kt_admin_requests");

    case "decide": {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: "Ungültiger Antrag" }, 400);
      return rpc("kt_admin_decide", {
        p_id: id,
        p_accept: body.accept === true,
        p_reply:
          String(body.reply ?? "")
            .trim()
            .slice(0, 300) || null,
      });
    }

    case "ban_global": {
      if (!UUID.test(groupId) || !UUID.test(memberId))
        return json({ error: "Ungültige Daten" }, 400);
      const { data: device, error } = await db.rpc("kt_admin_member_device", {
        p_group: groupId,
        p_member: memberId,
      });
      if (error || !device) return json({ error: "Mitglied nicht gefunden" }, 404);
      return rpc("kt_admin_ban_global", {
        p_device: device,
        p_reason:
          String(body.reason ?? "")
            .trim()
            .slice(0, 300) || null,
      });
    }

    case "unban_global": {
      let device = String(body.device ?? "");
      if (!UUID.test(device) && UUID.test(groupId) && UUID.test(memberId)) {
        const { data } = await db.rpc("kt_admin_member_device", {
          p_group: groupId,
          p_member: memberId,
        });
        device = String(data ?? "");
      }
      if (!UUID.test(device)) return json({ error: "Ungültige Daten" }, 400);
      return rpc("kt_admin_unban_global", { p_device: device });
    }

    case "global_bans":
      return rpc("kt_admin_global_bans");

    // Team-Mitteilungen (Anträge, Wächter): nur ausdrücklich eingetragene Geräte.
    case "team_device": {
      const device = String(body.deviceId ?? "");
      if (!UUID.test(device)) return json({ error: "Ungültiges Gerät" }, 400);
      const { data: row } = await db
        .from("app_config")
        .select("value")
        .eq("key", "admin_devices")
        .maybeSingle();
      let list: string[] = Array.isArray(row?.value?.devices) ? row.value.devices : [];
      const live = await withPush(db, [...list, device]);
      // Beim Eintragen Geräte ohne Mitteilungs-Abo aussortieren (z. B. App neu
      // installiert → neue Geräte-ID): an die käme nie etwas an.
      if (body.mode === "on")
        list = [...new Set([...list.filter((d) => live.has(d)), device])].slice(-5);
      if (body.mode === "off") list = list.filter((d) => d !== device);
      if (body.mode === "only") list = [device];
      if (body.mode) {
        const { error } = await db.from("app_config").upsert({
          key: "admin_devices",
          value: { devices: list },
          updated_at: new Date().toISOString(),
        });
        if (error) return json({ error: "Speichern fehlgeschlagen" }, 500);
      }
      // Letzte Zustellung je eingetragenem Gerät (SQL-Update „Zustell-Bestätigung“).
      const { data: deliv } = list.length
        ? await db
            .from("kt_team_delivery")
            .select("device_id, last_ok_at, last_fail_at, last_status")
            .in("device_id", list)
        : { data: [] };
      type Deliv = {
        device_id: string;
        last_ok_at: string | null;
        last_fail_at: string | null;
        last_status: number | null;
      };
      return json({
        ok: true,
        registered: list.includes(device),
        count: list.length,
        // Wie viele eingetragene Geräte wirklich Mitteilungen empfangen können.
        reachable: list.filter((d) => live.has(d)).length,
        selfPush: live.has(device),
        devices: list.map((d) => {
          const x = ((deliv ?? []) as Deliv[]).find((r) => r.device_id === d);
          return {
            self: d === device,
            push: live.has(d),
            lastOk: x?.last_ok_at ?? null,
            lastFail: x?.last_fail_at ?? null,
            lastStatus: x?.last_status ?? null,
          };
        }),
      });
    }

    // ---- Wächter ----

    case "alerts": {
      const { data, error } = await db
        .from("kt_alerts")
        .select("key, message, active, first_at, last_seen_at, resolved_at")
        .order("active", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(30);
      if (error) return json({ alerts: null }); // SQL-Update fehlt noch
      return json({ alerts: data ?? [] });
    }

    // Test: Mitteilung an alle eingetragenen Team-Geräte (kommt in ~1 Minute).
    case "alert_test": {
      const { data: row } = await db
        .from("app_config")
        .select("value")
        .eq("key", "admin_devices")
        .maybeSingle();
      const devices: string[] = Array.isArray(row?.value?.devices) ? row.value.devices : [];
      if (devices.length === 0)
        return json({ error: "Kein Gerät für Team-Mitteilungen eingetragen" }, 400);
      const live = await withPush(db, devices);
      const targets = devices.filter((d) => live.has(d));
      if (targets.length === 0)
        return json(
          {
            error:
              "Kein eingetragenes Gerät kann Mitteilungen empfangen – dieses Gerät neu eintragen",
          },
          400,
        );
      const { error } = await db.from("kt_push_queue").insert(
        targets.map((d) => ({
          device_id: d,
          title: "🔔 KickTime-Wächter: Test",
          body: "So sehen Warnungen aus, wenn Live-Daten ausfallen.",
          url: "/einstellungen",
          tag: "alert-test",
        })),
      );
      return error
        ? json({ error: "Speichern fehlgeschlagen" }, 500)
        : json({ ok: true, count: targets.length, skipped: devices.length - targets.length });
    }

    case "owner_transfer":
      if (!UUID.test(groupId) || !UUID.test(memberId))
        return json({ error: "Ungültige Daten" }, 400);
      return rpc("kt_admin_transfer", { p_group: groupId, p_member: memberId });

    default:
      return json({ error: "Unbekannte Aktion" }, 400);
  }
});
