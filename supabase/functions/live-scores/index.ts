/**
 * Edge Function: live-scores
 *
 * Holt die EM-Spiele von OpenLigaDB, cacht sie kurz (live: 60 s, sonst 5 min)
 * und speichert beendete Ergebnisse dauerhaft in `match_results`. Ein einmal
 * beendetes Spiel wird nie wieder durch spätere (evtl. fehlerhafte) Daten
 * überschrieben.
 *
 * POST { force?: boolean } → { fixtures: LiveFixture[], cache: "hit"|"miss"|"stale"|"paused", url }
 *
 * Quelle: im Admin-Bereich einstellbar (app_config „live_source“: Liga, Saison,
 * API-Endung, Pause). Sonst Secrets OPENLIGA_LEAGUE ("em") / OPENLIGA_SEASON ("2028").
 *
 * Zweitquelle ESPN: Die Antwort nennt nur die eingestellte ESPN-Liga (`espn`,
 * Standard „uefa.euro“, leer = aus). Abrufen muss die App selbst – ESPN sperrt
 * Anfragen aus Rechenzentren (403), erlaubt aber Browser (CORS). Gespeichert
 * werden nur Endergebnisse der Hauptquelle.
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

// OpenLigaDB → normalisiertes Spiel. Spiegelbild von src/domain/live.ts (fromOpenLiga).

type Score = { home: number; away: number };
type LiveFixture = {
  externalId: string;
  kickoffUtc?: string;
  city?: string | null;
  stadium?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  status: "scheduled" | "live" | "finished";
  score?: Score;
  penalties?: Score;
  phase?: "first" | "half" | "second" | "extra" | "penalties";
  minute?: number;
};

type OlResult = {
  pointsTeam1: number;
  pointsTeam2: number;
  resultTypeID?: number;
  resultTypeKind?: string;
};
type OlGoal = { scoreTeam1: number; scoreTeam2: number; matchMinute?: number | null };
type OpenLigaMatch = {
  matchID: number;
  matchDateTimeUTC?: string;
  matchIsFinished?: boolean;
  team1?: { teamName?: string; shortName?: string } | null;
  team2?: { teamName?: string; shortName?: string } | null;
  matchResults?: OlResult[] | null;
  goals?: OlGoal[] | null;
  location?: { locationCity?: string | null; locationStadium?: string | null } | null;
};

function fromOpenLiga(m: OpenLigaMatch, now: number): LiveFixture {
  const kickoff = m.matchDateTimeUTC ? Date.parse(m.matchDateTimeUTC) : NaN;
  const results = m.matchResults ?? [];
  const byKind = (kind: string, typeId: number) =>
    results.find((r) => r.resultTypeKind === kind) ??
    results.find((r) => r.resultTypeID === typeId);
  const toScore = (r?: OlResult): Score | undefined =>
    r && typeof r.pointsTeam1 === "number"
      ? { home: r.pointsTeam1, away: r.pointsTeam2 }
      : undefined;
  const pens = toScore(byKind("AfterPenalties", 5));
  const afterEt = toScore(byKind("AfterExtraTime", 3));
  const after90 = toScore(byKind("After90Minutes", 2));
  const half = toScore(byKind("HalfTime", 1));
  const goals = [...(m.goals ?? [])].sort((a, b) => (a.matchMinute ?? 0) - (b.matchMinute ?? 0));
  const last = goals[goals.length - 1];
  const fromGoals = last ? { home: last.scoreTeam1, away: last.scoreTeam2 } : undefined;

  let status: LiveFixture["status"] = "scheduled";
  if (m.matchIsFinished) status = "finished";
  else if (!Number.isNaN(kickoff) && now >= kickoff) status = "live";
  if (!Number.isNaN(kickoff) && kickoff > now) status = "scheduled";

  let score: Score | undefined;
  let penalties: Score | undefined;
  if (status === "finished") {
    score = afterEt ?? after90 ?? fromGoals;
    if (pens && score && score.home === score.away && pens.home !== pens.away) {
      penalties =
        pens.home >= score.home && pens.away >= score.away
          ? { home: pens.home - score.home, away: pens.away - score.away }
          : pens;
      if (penalties.home === penalties.away) penalties = pens;
    }
  } else if (status === "live") {
    score = fromGoals ?? afterEt ?? after90 ?? half ?? { home: 0, away: 0 };
  }

  let phase: LiveFixture["phase"];
  let minute: number | undefined;
  if (status === "live" && !Number.isNaN(kickoff)) {
    minute = Math.max(1, Math.floor((now - kickoff) / 60_000));
    phase = minute < 47 ? "first" : minute < 62 ? "half" : minute <= 112 ? "second" : "extra";
  }

  return {
    externalId: String(m.matchID),
    kickoffUtc: Number.isNaN(kickoff)
      ? undefined
      : new Date(kickoff).toISOString().replace(".000Z", "Z"),
    city: m.location?.locationCity ?? null,
    stadium: m.location?.locationStadium ?? null,
    homeName: m.team1?.teamName ?? m.team1?.shortName ?? null,
    awayName: m.team2?.teamName ?? m.team2?.shortName ?? null,
    status,
    score,
    penalties,
    phase,
    minute,
  };
}

const LIVE_TTL = 60_000;
const IDLE_TTL = 5 * 60_000;
const FORCE_MIN_INTERVAL = 30_000;
let lastForce = 0;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let force = body?.force === true;
    if (force && Date.now() - lastForce < FORCE_MIN_INTERVAL) force = false;
    if (force) lastForce = Date.now();

    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const src = await liveSource(db);
    const url = `https://api.openligadb.de/getmatchdata/${src.league}/${src.season}${src.suffix ? `/${src.suffix}` : ""}`;
    const cacheId = `${src.league}-${src.season}${src.suffix ? `-${src.suffix}` : ""}`;

    const { data: cached } = await db
      .from("live_cache")
      .select("payload, fetched_at")
      .eq("id", cacheId)
      .maybeSingle();
    const cachedList = (cached?.payload as LiveFixture[] | undefined) ?? [];
    const now = Date.now();
    const anyLive = cachedList.some((f) => f.status === "live");
    const ttl = anyLive ? LIVE_TTL : IDLE_TTL;
    if (src.paused) {
      // Abruf angehalten (Admin): nur gespeicherter Stand + Korrekturen.
      return json({
        fixtures: await mergeStored(db, cachedList),
        espn: "",
        cache: "paused",
        url,
      });
    }
    const espn = src.backup;
    if (cached && !force && now - Date.parse(cached.fetched_at) < ttl) {
      return json({ fixtures: await mergeStored(db, cachedList), espn, cache: "hit", url });
    }

    let fresh: LiveFixture[];
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`OpenLigaDB ${res.status}`);
      const raw = (await res.json()) as OpenLigaMatch[];
      fresh = Array.isArray(raw) ? raw.map((m) => fromOpenLiga(m, now)) : [];
    } catch (err) {
      // Upstream gestört → letzter Stand
      return json({
        fixtures: await mergeStored(db, cachedList),
        espn,
        cache: "stale",
        url,
        warning: String(err),
      });
    }

    await db
      .from("live_cache")
      .upsert({ id: cacheId, payload: fresh, fetched_at: new Date(now).toISOString() });
    await persistFinished(db, fresh);
    return json({ fixtures: await mergeStored(db, fresh), espn, cache: "miss", url });
  } catch (err) {
    console.error("[live-scores]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Db = any;

type Source = {
  league: string;
  season: string;
  suffix: string;
  paused: boolean;
  /** ESPN-Liga der Zweitquelle, leer = aus. */
  backup: string;
};

const ESPN_DEFAULT = "uefa.euro";
const ESPN_LEAGUE = /^[a-z0-9]{2,12}(\.[a-z0-9_]{1,20})?$/;

let sourceCache: { at: number; value: Source } | null = null;

/**
 * Live-Quelle: Admin-Einstellung (app_config), sonst Secrets bzw. Standard.
 * 30 Sekunden im Speicher – bei Spielen fragen viele Geräte jede Minute.
 */
async function liveSource(db: Db): Promise<Source> {
  if (sourceCache && Date.now() - sourceCache.at < 30_000) return sourceCache.value;
  const value = await readSource(db);
  sourceCache = { at: Date.now(), value };
  return value;
}

async function readSource(db: Db): Promise<Source> {
  const fallback: Source = {
    league: env("OPENLIGA_LEAGUE", "em"),
    season: env("OPENLIGA_SEASON", "2028"),
    suffix: "",
    paused: false,
    backup: ESPN_DEFAULT,
  };
  const { data, error } = await db
    .from("app_config")
    .select("value")
    .eq("key", "live_source")
    .maybeSingle();
  if (error || !data?.value) return fallback; // SQL-Update fehlt oder nichts eingestellt
  const v = data.value as Partial<Source>;
  return {
    league: /^[a-z0-9_]{1,30}$/i.test(String(v.league)) ? String(v.league) : fallback.league,
    season: /^\d{4}$/.test(String(v.season)) ? String(v.season) : fallback.season,
    suffix: /^\d{1,3}$/.test(String(v.suffix ?? "")) ? String(v.suffix) : "",
    paused: v.paused === true,
    // Älterer Eintrag ohne Feld → Standard; leer → ausgeschaltet.
    backup:
      v.backup === undefined
        ? ESPN_DEFAULT
        : ESPN_LEAGUE.test(String(v.backup))
          ? String(v.backup)
          : "",
  };
}

/** Beendete Spiele dauerhaft speichern – aber nie ein bereits beendetes überschreiben. */
async function persistFinished(db: Db, list: LiveFixture[]) {
  const done = list.filter((f) => f.status === "finished" && f.score);
  if (done.length === 0) return;
  const { data: existing } = await db
    .from("match_results")
    .select("external_id")
    .eq("finished", true)
    .in(
      "external_id",
      done.map((f) => f.externalId),
    );
  const known = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  const rows = done
    .filter((f) => !known.has(f.externalId))
    .map((f) => ({
      external_id: f.externalId,
      fixture: f,
      finished: true,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) await db.from("match_results").upsert(rows);
}

/** Gespeicherte Endergebnisse haben Vorrang vor den aktuellen Upstream-Daten. */
async function mergeStored(db: Db, list: LiveFixture[]): Promise<LiveFixture[]> {
  const { data } = await db
    .from("match_results")
    .select("external_id, fixture")
    .eq("finished", true);
  const stored = new Map<string, LiveFixture>(
    (data ?? []).map((r: { external_id: string; fixture: LiveFixture }) => [
      r.external_id,
      r.fixture,
    ]),
  );
  const out = list.map((f) => stored.get(f.externalId) ?? f);
  for (const [id, f] of stored) if (!list.some((x) => x.externalId === id)) out.push(f);
  return out;
}
