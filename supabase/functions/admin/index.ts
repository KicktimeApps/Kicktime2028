/**
 * Edge Function: admin
 *
 * Einziger Schreibweg für Admin-Korrekturen + Statistik/Feedback-Abfrage.
 * Die PIN liegt nur als Secret ADMIN_PIN auf dem Server. Brute-Force-Schutz:
 * nach 5 Fehlversuchen pro IP (bzw. 30 insgesamt) ist der Zugang 15 Minuten gesperrt.
 *
 * Aktionen: verify | set | clear | stats | feedback | fixtures | delete_tip_groups
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
      // Push-Zustand: Abos, anstehende Erinnerungen, in 24 h verschickte.
      const head = { count: "exact" as const, head: true };
      const nowIso = new Date().toISOString();
      const [subs, upcoming, sent24h] = await Promise.all([
        db.from("push_subscriptions").select("device_id", head),
        db.from("match_alarms").select("device_id", head).gt("kickoff_utc", nowIso),
        db
          .from("match_alarms")
          .select("device_id", head)
          .gte("notified_for", since(86_400_000))
          .lte("notified_for", new Date(Date.now() + 3_600_000).toISOString()),
      ]);
      const push = {
        subscriptions: subs.count ?? 0,
        upcoming: upcoming.count ?? 0,
        sent24h: sent24h.count ?? 0,
      };
      return json({ online, day, week, total, topTeams, push });
    }

    // Anstoßzeiten für die Tipprunden-Sperre (kt_fixtures) aus der App übernehmen.
    case "fixtures": {
      const list = Array.isArray(body.fixtures) ? body.fixtures.slice(0, 60) : [];
      const rows = list
        .filter(
          (f: { matchId?: string; kickoffUtc?: string }) =>
            /^m\d{2}$/.test(String(f.matchId)) && !Number.isNaN(Date.parse(String(f.kickoffUtc))),
        )
        .map((f: { matchId: string; kickoffUtc: string }) => ({
          match_id: f.matchId,
          kickoff_utc: new Date(f.kickoffUtc).toISOString(),
        }));
      if (rows.length === 0) return json({ error: "Keine gültigen Anstoßzeiten" }, 400);
      const { error } = await db.from("kt_fixtures").upsert(rows);
      return error
        ? json({ error: "Speichern fehlgeschlagen (SQL-Update Tipprunde ausgeführt?)" }, 500)
        : json({ ok: true, count: rows.length });
    }

    case "feedback": {
      const { data } = await db
        .from("app_feedback")
        .select("rating, message, created_at, app_version")
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

    default:
      return json({ error: "Unbekannte Aktion" }, 400);
  }
});
