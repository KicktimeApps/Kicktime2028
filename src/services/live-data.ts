import {
  applyLiveFixtures,
  fromEspn,
  fromOpenLiga,
  mergeLiveResults,
  type EspnEvent,
  type LiveFixture,
  type OpenLigaMatch,
} from "@/domain/live";
import type { FixturePatch, LivePhase, MatchStatus, ResultRecord, Score } from "@/domain/types";
import { LIVE_SOURCE, TOURNAMENT } from "@/tournament/config";
import { FIXTURES } from "@/tournament/schedule";
import { liveMatchTeams, useMatchStore } from "@/store/match-store";
import { logError } from "@/lib/error-log";
import { refreshAnnouncement } from "./announcement";
import { reportSourceIssue } from "./source-report";
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

type Fetched = {
  fixtures: LiveFixture[];
  /** ESPN-Liga der Zweitquelle (vom Server eingestellt), leer = aus. */
  espn: string;
  url: string | null;
  cache: string | null;
};

async function fetchFromBackend(force = false): Promise<Fetched> {
  const sb = await getSupabase();
  if (!sb) throw new Error("Backend nicht konfiguriert");
  const { data, error } = await sb.functions.invoke<{
    fixtures?: BackendFixture[];
    espn?: string;
    url?: string;
    cache?: string;
    error?: string;
  }>("live-scores", { body: { force } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return {
    fixtures: data?.fixtures ?? [],
    // Älterer Server ohne Feld → Standard.
    espn: typeof data?.espn === "string" ? data.espn : ESPN_DEFAULT,
    url: data?.url ?? null,
    cache: data?.cache ?? null,
  };
}

async function fetchFromOpenLiga(): Promise<Fetched> {
  const res = await fetch(OPENLIGA_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenLigaDB ${res.status}`);
  const raw = (await res.json()) as OpenLigaMatch[];
  const now = Date.now();
  const fixtures = Array.isArray(raw) ? raw.map((m) => fromOpenLiga(m, now)) : [];
  return { fixtures, espn: ESPN_DEFAULT, url: OPENLIGA_URL, cache: null };
}

const ESPN_DEFAULT = "uefa.euro";
/** Zuletzt vom Server gemeldete ESPN-Liga – so laufen beide Abrufe gleichzeitig. */
let espnLeague = ESPN_DEFAULT;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

/**
 * Zweitquelle ESPN – direkt aus dem Browser, weil ESPN Anfragen aus
 * Rechenzentren (also auch vom Server) sperrt. Nur an Tagen mit EM-Spiel
 * (UTC; alle Spiele enden vor Mitternacht), bei einer anderen Test-Liga immer.
 * Fehler sind für die Anzeige egal (dann eben nur OpenLigaDB), werden aber
 * dem KickTime-Team gemeldet (Wächter).
 */
async function fetchEspn(league: string, now: number): Promise<LiveFixture[]> {
  if (!/^[a-z0-9]{2,12}(\.[a-z0-9_]{1,20})?$/.test(league)) return [];
  const today = ymd(now);
  const matchDay = useMatchStore
    .getState()
    .tournament.matches.some((m) => ymd(Date.parse(m.kickoffUtc)) === today);
  if (league === ESPN_DEFAULT && !matchDay) return [];
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${today}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) {
      reportSourceIssue("espn", `ESPN antwortet mit Fehler ${res.status}`);
      return [];
    }
    const raw = (await res.json()) as { events?: EspnEvent[] };
    const events = Array.isArray(raw?.events) ? raw.events : [];
    // An einem EM-Spieltag müssen dort Spiele stehen.
    if (matchDay && events.length === 0)
      reportSourceIssue("espn", "ESPN liefert heute keine Spiele");
    return events.map((e) => fromEspn(e, now));
  } catch (err) {
    reportSourceIssue(
      "espn",
      `ESPN nicht erreichbar (${err instanceof Error ? err.name : "Fehler"})`,
    );
    return [];
  }
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
    const backend = isBackendConfigured();
    try {
      const now = Date.now();
      const asked = espnLeague;
      const espnRun = fetchEspn(asked, now);
      const { fixtures, espn, url, cache } = backend
        ? await fetchFromBackend(opts.force)
        : await fetchFromOpenLiga();
      espnLeague = espn;
      // Ausgeschaltet → verwerfen; Liga geändert → gleich mit der neuen fragen.
      const backup = !espn ? [] : espn === asked ? await espnRun : await fetchEspn(espn, now);
      const teams = liveMatchTeams();
      const { results, patches, unmatched } = mergeLiveResults(
        applyLiveFixtures(fixtures, FIXTURES, teams, now),
        applyLiveFixtures(backup, FIXTURES, teams, now),
      );
      useMatchStore.getState().setApiData(results, patches);
      useMatchStore.getState().setLiveMeta({
        source: backend ? "backend" : "openligadb",
        lastFetchAt: Date.now(),
        lastError: null,
        unmatched: unmatched.length,
        apiUrl: url,
        cache,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // lastFetchAt bleibt beim letzten erfolgreichen Abruf („Stand von …“).
      useMatchStore.getState().setLiveMeta({ lastError: msg });
      logError("api", msg);
      if (backend) reportSourceIssue("backend", `Live-Daten vom Server: ${msg}`);
    }
    if (backend) {
      const overrides = await fetchOverrides().catch(() => null);
      if (overrides) useMatchStore.getState().setAdminResults(overrides);
      await refreshAnnouncement();
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
