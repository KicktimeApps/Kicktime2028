import {
  applyLiveFixtures,
  fromOpenLiga,
  type LiveFixture,
  type OpenLigaMatch,
} from "@/domain/live";
import type { FixturePatch, LivePhase, MatchStatus, ResultRecord, Score } from "@/domain/types";
import { LIVE_SOURCE, TOURNAMENT } from "@/tournament/config";
import { FIXTURES } from "@/tournament/schedule";
import { useMatchStore } from "@/store/match-store";
import { logError } from "@/lib/error-log";
import { getSupabase, isBackendConfigured } from "./supabase";

/**
 * Live-Daten-Pipeline.
 *
 *  Mit Backend:  Edge Function `live-scores` (Cache + persistente Ergebnisse)
 *  Ohne Backend: OpenLigaDB direkt aus dem Browser (CORS erlaubt)
 *
 * Danach werden Admin-Korrekturen (`match_overrides`) geladen. Alles landet
 * im Match-Store, der daraus den Turnierzustand berechnet.
 */

const OPENLIGA_URL = `https://api.openligadb.de/getmatchdata/${LIVE_SOURCE.league}/${LIVE_SOURCE.season}`;

type BackendFixture = {
  externalId: string;
  kickoffUtc?: string;
  city?: string | null;
  stadium?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  status: MatchStatus;
  score?: Score;
  penalties?: Score;
  phase?: LivePhase;
  minute?: number;
};

async function fetchFromBackend(force = false): Promise<LiveFixture[]> {
  const sb = await getSupabase();
  if (!sb) throw new Error("Backend nicht konfiguriert");
  const { data, error } = await sb.functions.invoke<{
    fixtures?: BackendFixture[];
    error?: string;
  }>("live-scores", { body: { force } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data?.fixtures ?? [];
}

async function fetchFromOpenLiga(): Promise<LiveFixture[]> {
  const res = await fetch(OPENLIGA_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenLigaDB ${res.status}`);
  const raw = (await res.json()) as OpenLigaMatch[];
  const now = Date.now();
  return Array.isArray(raw) ? raw.map((m) => fromOpenLiga(m, now)) : [];
}

type OverrideRow = {
  match_id: string;
  score_home: number;
  score_away: number;
  pens_home: number | null;
  pens_away: number | null;
  status: MatchStatus;
  phase: LivePhase | null;
  updated_at: string;
  source_sig?: string | null;
};

/** Admin-Korrekturen laden; null bei Fehler (dann bleiben die bisherigen). */
async function fetchOverrides(): Promise<Record<string, ResultRecord> | null> {
  const sb = await getSupabase();
  if (!sb) return {};
  const { data, error } = await sb
    .from("match_overrides")
    // "*" statt fester Spalten: funktioniert auch, bevor source_sig angelegt ist.
    .select("*");
  if (error) {
    logError("supabase", `Overrides: ${error.message}`);
    return null;
  }
  const out: Record<string, ResultRecord> = {};
  for (const r of (data ?? []) as OverrideRow[]) {
    out[r.match_id] = {
      status: r.status,
      score: { home: r.score_home, away: r.score_away },
      penalties:
        r.pens_home != null && r.pens_away != null
          ? { home: r.pens_home, away: r.pens_away }
          : undefined,
      phase: r.phase ?? undefined,
      source: "admin",
      updatedAt: Date.parse(r.updated_at),
      sourceSig: r.source_sig ?? undefined,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Offline: zuletzt geladener Stand bleibt auf dem Gerät               */
/* ------------------------------------------------------------------ */

const CACHE_KEY = `${TOURNAMENT.storagePrefix}-live`;

type LiveCache = {
  at: number;
  results: Record<string, ResultRecord>;
  patches: Record<string, FixturePatch>;
  admin: Record<string, ResultRecord>;
};

function saveLiveCache() {
  const s = useMatchStore.getState();
  if (s.demo.enabled || !s.live.lastFetchAt || s.live.lastError) return;
  try {
    const data: LiveCache = {
      at: s.live.lastFetchAt,
      results: s.apiResults,
      patches: s.apiPatches,
      admin: s.adminResults,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* Speicher voll oder gesperrt – dann eben ohne */
  }
}

/**
 * Beim Start den zuletzt gespeicherten Stand anzeigen, bis frische Daten da
 * sind – so ist die App auch im Funkloch sofort nutzbar.
 */
export function restoreLiveCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const c = JSON.parse(raw) as LiveCache;
    const store = useMatchStore.getState();
    if (store.live.lastFetchAt) return; // schon frische Daten
    store.setApiData(c.results ?? {}, c.patches ?? {});
    store.setAdminResults(c.admin ?? {});
    store.setLiveMeta({ lastFetchAt: c.at, source: "cache" });
  } catch {
    /* kaputter Eintrag – ignorieren */
  }
}

let inflight: Promise<void> | null = null;

/** Holt aktuelle Daten und schreibt sie in den Store. Parallele Aufrufe werden gebündelt. */
export function refreshLiveData(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const store = useMatchStore.getState();
    const backend = isBackendConfigured();
    try {
      const fixtures = backend ? await fetchFromBackend(opts.force) : await fetchFromOpenLiga();
      const teams = new Map(
        store.tournament.matches.map((m) => [m.number, { home: m.home, away: m.away }]),
      );
      const { results, patches, unmatched } = applyLiveFixtures(
        fixtures,
        FIXTURES,
        teams,
        Date.now(),
      );
      useMatchStore.getState().setApiData(results, patches);
      useMatchStore.getState().setLiveMeta({
        source: backend ? "backend" : "openligadb",
        lastFetchAt: Date.now(),
        lastError: null,
        unmatched: unmatched.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // lastFetchAt bleibt beim letzten erfolgreichen Abruf („Stand von …“).
      useMatchStore.getState().setLiveMeta({ lastError: msg });
      logError("api", msg);
    }
    if (backend) {
      const overrides = await fetchOverrides().catch(() => null);
      if (overrides) useMatchStore.getState().setAdminResults(overrides);
    }
    saveLiveCache();
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Wie oft sollen Daten geholt werden?
 *  - rund um laufende Spiele: jede Minute (Backend cacht serverseitig)
 *  - Turnierzeitraum sonst: alle 15 Minuten
 *  - außerhalb: einmal beim Start reicht (Auslosung/Anstoßzeiten)
 */
export function pollInterval(now: number, hasLiveWindow: boolean): number | null {
  const start = Date.parse(TOURNAMENT.start) - 3 * 86_400_000;
  const end = Date.parse(TOURNAMENT.end) + 86_400_000;
  if (hasLiveWindow) return 60_000;
  if (now >= start && now <= end) return 15 * 60_000;
  return null;
}
