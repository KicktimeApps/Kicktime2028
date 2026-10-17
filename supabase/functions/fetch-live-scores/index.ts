/**
 * Supabase Edge Function: fetch-live-scores
 *
 * - OpenLigaDB Upstream (frei, ohne Key)
 * - 5-Minuten-Cache in `live_fixtures_cache`
 * - PERSISTENTER Speicher in `match_results` (Single Source of Truth)
 *   → beim Phasen-Wechsel gehen keine alten Ergebnisse verloren
 * - Manuelle Admin-Overrides aus `match_overrides` gewinnen (dynamisch)
 * - CORS auf ALLEN Responses
 *
 * Modi (POST-Body):
 *   { mode: "live" | "idle", koPhase?: 4..9 }  → normaler Poll (aktive Phase),
 *                                                 füllt Cache + match_results
 *   { mode: "sync-groups" }                    → zwingt wm2026/2026 Fetch und
 *                                                 schreibt alles in match_results
 *   { mode: "full-store" }                     → liefert ALLE Zeilen aus
 *                                                 match_results im Fixture-Format
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

const CACHE_ID = "world-cup-2026";
const LIVE_TTL_MS = 5 * 60_000;
const IDLE_TTL_MS = 5 * 60_000;
const GROUPS_UPSTREAM_URL = "https://api.openligadb.de/getmatchdata/wm2026/2026";
const DEFAULT_UPSTREAM_URL = GROUPS_UPSTREAM_URL;
const KO_PHASE_URLS: Record<number, string> = {
  4: "https://api.openligadb.de/getmatchdata/wm26/2026/4",
  5: "https://api.openligadb.de/getmatchdata/wm26/2026/5",
  6: "https://api.openligadb.de/getmatchdata/wm26/2026/6",
  7: "https://api.openligadb.de/getmatchdata/wm26/2026/7",
  8: "https://api.openligadb.de/getmatchdata/wm26/2026/8",
  9: "https://api.openligadb.de/getmatchdata/wm26/2026/9",
};
const MATCH_WINDOW_MS = 130 * 60 * 1000;

type Override = {
  match_id: string;
  score_a: number;
  score_b: number;
  minute: number | null;
  status: "scheduled" | "live" | "finished";
  is_manual: boolean;
};

type StoredRow = {
  match_id: string;
  phase: number | null;
  team_home_name: string | null;
  team_away_name: string | null;
  score_home: number | null;
  score_away: number | null;
  status: string;
  minute: number | null;
  kickoff_utc: string | null;
  stadium: string | null;
  city: string | null;
  raw: any;
  finished_at: string | null;
  updated_at?: string;
};

// In-memory rate limiter for privileged/write-heavy modes. Not perfect across
// warm/cold instances, but curbs sustained abuse against the OpenLigaDB
// upstream and repeated writes to match_results.
const RATE_WINDOW_MS: Record<string, number> = {
  "sync-groups": 60_000,
  "force": 30_000,
};
const lastCalledAt = new Map<string, number>();

function rateLimitCheck(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const window = RATE_WINDOW_MS[key];
  if (!window) return { ok: true };
  const now = Date.now();
  const last = lastCalledAt.get(key) ?? 0;
  const elapsed = now - last;
  if (elapsed < window) {
    return { ok: false, retryAfterSec: Math.ceil((window - elapsed) / 1000) };
  }
  lastCalledAt.set(key, now);
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Reject fully unauthenticated callers: legitimate frontend requests always
  // carry the Supabase anon (or user) JWT via Authorization/apikey headers.
  // This keeps random internet scripts from hammering the function without any
  // key at all.
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey") ?? "";
  const hasBearer = /^Bearer\s+\S+/i.test(authHeader) || apiKeyHeader.length > 0;
  if (!hasBearer) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    let mode: "live" | "idle" | "sync-groups" | "full-store" = "live";
    let koPhase: number | null = null;
    let force = false;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const m = body?.mode;
      if (m === "idle" || m === "sync-groups" || m === "full-store") mode = m;
      const kp = Number(body?.koPhase);
      if ([4, 5, 6, 7, 8, 9].includes(kp)) koPhase = kp;
      if (body?.force === true) force = true;
    }

    // Throttle write-heavy / cache-busting modes so a scripted attacker can't
    // spam OpenLigaDB fetches and match_results upserts.
    if (mode === "sync-groups") {
      const check = rateLimitCheck("sync-groups");
      if (!check.ok) {
        return json({ error: "Rate limited", retryAfterSec: check.retryAfterSec, synced: 0 }, 429);
      }
    } else if (force) {
      const check = rateLimitCheck("force");
      if (!check.ok) {
        return json({ error: "Rate limited", retryAfterSec: check.retryAfterSec, fixtures: [] }, 429);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl) {
      return json({ error: "Service not configured", fixtures: [] }, 500);
    }
    const admin = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

    // ---------- MODE: full-store ----------
    if (mode === "full-store") {
      const overrides = await loadOverrides(admin);
      const stored = await loadAllStored(admin);
      const fixtures = stored.map(rowToFixture);
      const merged = mergeOverrides(fixtures, overrides);
      return json(
        { fixtures: merged, cache: "store", url: null, koPhase: null, count: merged.length },
        200,
      );
    }

    // ---------- MODE: sync-groups ----------
    if (mode === "sync-groups") {
      try {
        const upstream = await fetch(GROUPS_UPSTREAM_URL, {
          headers: { accept: "application/json" },
        });
        if (!upstream.ok) {
          return json(
            { error: `Upstream ${upstream.status}`, synced: 0, url: GROUPS_UPSTREAM_URL },
            200,
          );
        }
        const raw = await upstream.json();
        const list = Array.isArray(raw) ? raw : [];
        const fixtures = list.map(mapOpenLigaMatch).filter(Boolean) as any[];
        const written = await persistFixtures(admin, fixtures, null);
        return json(
          { synced: written, url: GROUPS_UPSTREAM_URL, fixtures, cache: "sync" },
          200,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg, synced: 0, url: GROUPS_UPSTREAM_URL }, 200);
      }
    }

    // ---------- MODE: live/idle (klassisch, aktive Phase) ----------
    const upstreamUrl = koPhase ? KO_PHASE_URLS[koPhase] : DEFAULT_UPSTREAM_URL;
    const cacheId = koPhase ? `wm26-ko-${koPhase}` : CACHE_ID;

    const overrides = await loadOverrides(admin);

    const ttl = mode === "live" ? LIVE_TTL_MS : IDLE_TTL_MS;
    let cached: { payload: any; fetched_at: string } | null = null;
    if (admin) {
      const { data } = await admin
        .from("live_fixtures_cache")
        .select("payload, fetched_at")
        .eq("id", cacheId)
        .maybeSingle();
      cached = (data as any) ?? null;
    }

    if (cached && !force) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < ttl) {
        const merged = mergeOverrides(cached.payload?.response ?? [], overrides);
        return json({ fixtures: merged, cache: "hit", url: upstreamUrl, koPhase }, 200);
      }
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { accept: "application/json" },
      });
      if (!upstream.ok) {
        if (cached) {
          const merged = mergeOverrides(cached.payload?.response ?? [], overrides);
          return json({ fixtures: merged, cache: "stale", url: upstreamUrl, koPhase, error: `Upstream ${upstream.status}` }, 200);
        }
        return json({ fixtures: overridesOnly(overrides), cache: "overrides", url: upstreamUrl, koPhase, error: `Upstream ${upstream.status}` }, 200);
      }

      const raw = await upstream.json();
      const response = Array.isArray(raw)
        ? (raw.map(mapOpenLigaMatch).filter(Boolean) as any[])
        : [];
      const payload = { response };

      if (admin) {
        await admin.from("live_fixtures_cache").upsert({
          id: cacheId,
          payload,
          fetched_at: new Date().toISOString(),
        });
        // Persistiere additiv in match_results — verlustfrei
        await persistFixtures(admin, response, koPhase);
      }

      const merged = mergeOverrides(response, overrides);
      return json({ fixtures: merged, cache: "miss", url: upstreamUrl, koPhase, upstreamCount: response.length }, 200);
    } catch (err) {
      console.error("[fetch-live-scores] upstream error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (cached) {
        const merged = mergeOverrides(cached.payload?.response ?? [], overrides);
        return json({ fixtures: merged, cache: "stale", url: upstreamUrl, koPhase, error: msg }, 200);
      }
      return json({ fixtures: overridesOnly(overrides), cache: "overrides", url: upstreamUrl, koPhase, error: msg }, 200);
    }
  } catch (err) {
    console.error("[fetch-live-scores] fatal:", err);
    return json({ error: "Internal error", fixtures: [] }, 500);
  }
});

// ============ Persistenz (match_results) ============

async function persistFixtures(
  admin: any,
  fixtures: any[],
  phase: number | null,
): Promise<number> {
  if (!admin || fixtures.length === 0) return 0;

  const ids = fixtures.map((f) => String(f?.fixture?.id ?? "")).filter(Boolean);
  if (ids.length === 0) return 0;

  const { data: existing } = await admin
    .from("match_results")
    .select("match_id, status, score_home, score_away, finished_at")
    .in("match_id", ids);
  const existingMap = new Map<string, StoredRow>();
  for (const row of (existing ?? []) as StoredRow[]) existingMap.set(row.match_id, row);

  const now = new Date().toISOString();
  const rows: StoredRow[] = [];
  for (const f of fixtures) {
    const id = String(f?.fixture?.id ?? "");
    if (!id) continue;
    const short: string = f?.fixture?.status?.short ?? "NS";
    const apiStatus: "scheduled" | "live" | "finished" =
      ["FT", "AET", "PEN", "AWD", "WO"].includes(short) ? "finished"
      : ["NS", "TBD", "PST"].includes(short) ? "scheduled"
      : "live";
    const apiScoreHome: number | null = f?.goals?.home ?? null;
    const apiScoreAway: number | null = f?.goals?.away ?? null;

    const prev = existingMap.get(id);
    const prevFinishedWithScore =
      prev?.status === "finished" && prev.score_home != null && prev.score_away != null;

    // NIEMALS ein abgeschlossenes Ergebnis überschreiben.
    const finalStatus = prevFinishedWithScore ? "finished" : apiStatus;
    const finalHome = prevFinishedWithScore ? prev!.score_home : apiScoreHome;
    const finalAway = prevFinishedWithScore ? prev!.score_away : apiScoreAway;
    const finishedAt =
      prev?.finished_at ??
      (apiStatus === "finished" && apiScoreHome != null ? now : null);

    rows.push({
      match_id: id,
      phase,
      team_home_name: f?.teams?.home?.name ?? null,
      team_away_name: f?.teams?.away?.name ?? null,
      score_home: finalHome,
      score_away: finalAway,
      status: finalStatus,
      minute: f?.fixture?.status?.elapsed ?? null,
      kickoff_utc: f?.fixture?.date ?? null,
      stadium: f?.fixture?.venue?.name ?? null,
      city: f?.fixture?.venue?.city ?? null,
      raw: f,
      finished_at: finishedAt,
      updated_at: now,
    });
  }

  try {
    const { error } = await admin
      .from("match_results")
      .upsert(rows, { onConflict: "match_id" });
    if (error) {
      console.warn("[persistFixtures] upsert failed:", error.message);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.warn("[persistFixtures] threw:", err);
    return 0;
  }
}

async function loadAllStored(admin: any): Promise<StoredRow[]> {
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("match_results")
      .select("*")
      .order("kickoff_utc", { ascending: true });
    if (error) {
      console.warn("[loadAllStored] failed:", error.message);
      return [];
    }
    return (data ?? []) as StoredRow[];
  } catch (err) {
    console.warn("[loadAllStored] threw:", err);
    return [];
  }
}

function rowToFixture(r: StoredRow): any {
  const short =
    r.status === "finished" ? "FT" : r.status === "live" ? "1H" : "NS";
  return {
    fixture: {
      id: r.match_id,
      date: r.kickoff_utc,
      status: { short, elapsed: r.minute },
      venue: { name: r.stadium, city: r.city },
    },
    teams: {
      home: { name: r.team_home_name },
      away: { name: r.team_away_name },
    },
    goals: { home: r.score_home, away: r.score_away },
  };
}

// ============ Overrides ============

async function loadOverrides(admin: any): Promise<Override[]> {
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("match_overrides")
      .select("match_id, score_a, score_b, minute, status, is_manual");
    if (error) {
      console.warn("[fetch-live-scores] overrides select failed:", error.message);
      return [];
    }
    return (data ?? []) as Override[];
  } catch (err) {
    console.warn("[fetch-live-scores] overrides threw:", err);
    return [];
  }
}

function mergeOverrides(fixtures: any[], overrides: Override[]): any[] {
  if (overrides.length === 0) return fixtures;
  const byId = new Map<string, any>();
  for (const f of fixtures) {
    const id = String(f?.fixture?.id ?? "");
    if (id) byId.set(id, f);
  }
  for (const o of overrides) {
    if (!o.is_manual) continue;
    const id = String(o.match_id);
    const existing = byId.get(id);

    if (existing) {
      const apiStatus: string = existing.fixture?.status?.short ?? "NS";
      const apiHome: number | null = existing.goals?.home ?? null;
      const apiAway: number | null = existing.goals?.away ?? null;
      const apiSum = (apiHome ?? 0) + (apiAway ?? 0);
      const ovrSum = (o.score_a ?? 0) + (o.score_b ?? 0);
      const apiFinished = apiStatus === "FT" || apiStatus === "AET" || apiStatus === "PEN";
      const apiLive = apiStatus === "1H" || apiStatus === "2H" || apiStatus === "HT" || apiStatus === "ET";
      if (apiFinished) continue;
      if (apiSum > ovrSum) continue;
      if (apiLive && o.status === "scheduled") continue;
    }

    const statusShort =
      o.status === "finished" ? "FT" : o.status === "live" ? "1H" : "NS";
    if (existing) {
      existing.goals = { home: o.score_a, away: o.score_b };
      existing.fixture = {
        ...existing.fixture,
        status: {
          short: statusShort,
          elapsed: o.minute ?? existing.fixture?.status?.elapsed ?? null,
        },
      };
    } else {
      byId.set(id, {
        fixture: {
          id,
          date: undefined,
          status: { short: statusShort, elapsed: o.minute ?? null },
          venue: { name: null, city: null },
        },
        teams: { home: { name: null }, away: { name: null } },
        goals: { home: o.score_a, away: o.score_b },
      });
    }
  }
  return [...byId.values()];
}

function overridesOnly(overrides: Override[]): any[] {
  return mergeOverrides([], overrides);
}

// ============ Mapping OpenLigaDB → Fixture ============

function mapOpenLigaMatch(m: any): any | null {
  if (!m || !m.team1 || !m.team2) return null;
  const dateIso = m.matchDateTimeUTC
    ? new Date(m.matchDateTimeUTC).toISOString()
    : undefined;
  const kickoff = dateIso ? new Date(dateIso).getTime() : NaN;
  const now = Date.now();

  let statusShort = "NS";
  if (m.matchIsFinished) {
    statusShort = "FT";
  } else if (!Number.isNaN(kickoff)) {
    if (now >= kickoff && now <= kickoff + MATCH_WINDOW_MS) statusShort = "1H";
  }

  let goalsHome: number | null = null;
  let goalsAway: number | null = null;
  if (Array.isArray(m.matchResults) && m.matchResults.length > 0) {
    const ordered = [...m.matchResults].sort(
      (a, b) => (b?.resultOrderID ?? 0) - (a?.resultOrderID ?? 0),
    );
    const final = ordered[0];
    if (final && typeof final.pointsTeam1 === "number") {
      goalsHome = final.pointsTeam1;
      goalsAway = final.pointsTeam2;
    }
  }
  if ((goalsHome == null || goalsAway == null) && Array.isArray(m.goals) && m.goals.length > 0) {
    const lastGoal = [...m.goals].sort(
      (a, b) => (b?.matchMinute ?? 0) - (a?.matchMinute ?? 0),
    )[0];
    if (lastGoal) {
      goalsHome = lastGoal.scoreTeam1 ?? 0;
      goalsAway = lastGoal.scoreTeam2 ?? 0;
    }
  }
  if (statusShort === "1H" && goalsHome == null) {
    goalsHome = 0;
    goalsAway = 0;
  }

  let elapsed: number | null = null;
  if (statusShort === "1H" && !Number.isNaN(kickoff)) {
    const raw = Math.floor((now - kickoff) / 60_000);
    let mm = Math.min(120, Math.max(1, raw));
    if (mm > 45 && mm < 60) mm = 45;
    elapsed = mm;
  }

  return {
    fixture: {
      id: m.matchID,
      date: dateIso,
      status: { short: statusShort, elapsed },
      venue: {
        name: m.location?.locationStadium ?? null,
        city: m.location?.locationCity ?? null,
      },
    },
    teams: {
      home: { name: m.team1?.teamName ?? m.team1?.shortName ?? null },
      away: { name: m.team2?.teamName ?? m.team2?.shortName ?? null },
    },
    goals: { home: goalsHome, away: goalsAway },
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
