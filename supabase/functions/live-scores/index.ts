/**
 * Edge Function: live-scores
 *
 * Holt die EM-Spiele von OpenLigaDB, cacht sie kurz (live: 60 s, sonst 5 min)
 * und speichert beendete Ergebnisse dauerhaft in `match_results`. Ein einmal
 * beendetes Spiel wird nie wieder durch spätere (evtl. fehlerhafte) Daten
 * überschrieben.
 *
 * POST { force?: boolean } → { fixtures: LiveFixture[], cache: "hit"|"miss"|"stale" }
 *
 * Secrets (optional): OPENLIGA_LEAGUE (Standard "em"), OPENLIGA_SEASON ("2028")
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { fromOpenLiga, type LiveFixture, type OpenLigaMatch } from "../_shared/openliga.ts";
import { env, json, preflight } from "../_shared/http.ts";

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

    const league = env("OPENLIGA_LEAGUE", "em");
    const season = env("OPENLIGA_SEASON", "2028");
    const url = `https://api.openligadb.de/getmatchdata/${league}/${season}`;
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const cacheId = `${league}-${season}`;

    const { data: cached } = await db.from("live_cache").select("payload, fetched_at").eq("id", cacheId).maybeSingle();
    const cachedList = (cached?.payload as LiveFixture[] | undefined) ?? [];
    const now = Date.now();
    const anyLive = cachedList.some((f) => f.status === "live");
    const ttl = anyLive ? LIVE_TTL : IDLE_TTL;
    if (cached && !force && now - Date.parse(cached.fetched_at) < ttl) {
      return json({ fixtures: await mergeStored(db, cachedList), cache: "hit" });
    }

    let fresh: LiveFixture[];
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`OpenLigaDB ${res.status}`);
      const raw = (await res.json()) as OpenLigaMatch[];
      fresh = Array.isArray(raw) ? raw.map((m) => fromOpenLiga(m, now)) : [];
    } catch (err) {
      // Upstream gestört → letzter Stand
      return json({ fixtures: await mergeStored(db, cachedList), cache: "stale", warning: String(err) });
    }

    await db.from("live_cache").upsert({ id: cacheId, payload: fresh, fetched_at: new Date(now).toISOString() });
    await persistFinished(db, fresh);
    return json({ fixtures: await mergeStored(db, fresh), cache: "miss" });
  } catch (err) {
    console.error("[live-scores]", err);
    return json({ error: "Interner Fehler" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Db = any;

/** Beendete Spiele dauerhaft speichern – aber nie ein bereits beendetes überschreiben. */
async function persistFinished(db: Db, list: LiveFixture[]) {
  const done = list.filter((f) => f.status === "finished" && f.score);
  if (done.length === 0) return;
  const { data: existing } = await db
    .from("match_results")
    .select("external_id")
    .eq("finished", true)
    .in("external_id", done.map((f) => f.externalId));
  const known = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  const rows = done
    .filter((f) => !known.has(f.externalId))
    .map((f) => ({ external_id: f.externalId, fixture: f, finished: true, updated_at: new Date().toISOString() }));
  if (rows.length > 0) await db.from("match_results").upsert(rows);
}

/** Gespeicherte Endergebnisse haben Vorrang vor den aktuellen Upstream-Daten. */
async function mergeStored(db: Db, list: LiveFixture[]): Promise<LiveFixture[]> {
  const { data } = await db.from("match_results").select("external_id, fixture").eq("finished", true);
  const stored = new Map<string, LiveFixture>(
    (data ?? []).map((r: { external_id: string; fixture: LiveFixture }) => [r.external_id, r.fixture]),
  );
  const out = list.map((f) => stored.get(f.externalId) ?? f);
  for (const [id, f] of stored) if (!list.some((x) => x.externalId === id)) out.push(f);
  return out;
}
