/**
 * Edge Function: admin
 *
 * Einziger Schreibweg für Admin-Korrekturen + Statistik/Feedback-Abfrage.
 * Die PIN liegt nur als Secret ADMIN_PIN auf dem Server. Brute-Force-Schutz:
 * nach 5 Fehlversuchen pro IP ist der Zugang 15 Minuten gesperrt.
 *
 * Aktionen: verify | set | clear | stats | feedback
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { env, json, preflight } from "../_shared/http.ts";

const MAX_FAILURES = 5;
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
  const ip = (req.headers.get("x-forwarded-for") ?? "unbekannt").split(",")[0].trim();
  const key = `ip:${ip}`;
  const { data: attempt } = await db.from("admin_attempts").select("failures, window_start").eq("key", key).maybeSingle();
  const windowActive = attempt && Date.now() - Date.parse(attempt.window_start) < LOCK_MS;
  if (windowActive && attempt.failures >= MAX_FAILURES) {
    return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
  }
  if (!safeEqual(String(body.pin ?? ""), pin)) {
    await db.from("admin_attempts").upsert({
      key,
      failures: windowActive ? attempt.failures + 1 : 1,
      window_start: windowActive ? attempt.window_start : new Date().toISOString(),
    });
    return json({ error: "Falsche PIN" }, 401);
  }
  if (attempt) await db.from("admin_attempts").delete().eq("key", key);

  const matchId = String(body.matchId ?? "");
  const validId = /^m\d{2}$/.test(matchId);

  switch (body.action) {
    case "verify":
      return json({ ok: true });

    case "set": {
      if (!validId || !STATUSES.includes(body.status)) return json({ error: "Ungültige Daten" }, 400);
      const row = {
        match_id: matchId,
        status: body.status,
        score_home: clampInt(body.scoreHome, 0, 50) ?? 0,
        score_away: clampInt(body.scoreAway, 0, 50) ?? 0,
        pens_home: body.pensHome == null ? null : clampInt(body.pensHome, 0, 50),
        pens_away: body.pensAway == null ? null : clampInt(body.pensAway, 0, 50),
        phase: PHASES.includes(body.phase) ? body.phase : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("match_overrides").upsert(row);
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
      const { data: favs } = await db.from("app_pings").select("fav_team").not("fav_team", "is", null).limit(5000);
      const tally = new Map<string, number>();
      for (const r of favs ?? []) tally.set(r.fav_team, (tally.get(r.fav_team) ?? 0) + 1);
      const topTeams = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([team, count]) => ({ team, count }));
      return json({ online, day, week, total, topTeams });
    }

    case "feedback": {
      const { data } = await db
        .from("app_feedback")
        .select("rating, message, created_at, app_version")
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ rows: data ?? [] });
    }

    default:
      return json({ error: "Unbekannte Aktion" }, 400);
  }
});
