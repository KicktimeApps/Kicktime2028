import { Clock, Database, FlaskConical, Save, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  clearLiveCache,
  fetchConfig,
  resetStoredResults,
  saveLiveSource,
  syncFixtures,
  testLiveSource,
  type AdminConfig,
  type SourceTest,
} from "@/services/admin";
import { refreshLiveData } from "@/services/live-data";
import { useMatchStore } from "@/store/match-store";
import { ActionButton, Card, ConfirmButton, Info } from "./shared";
import { fmtTime, useAction } from "./use-action";

const ESPN_DEFAULT = "uefa.euro";

const CACHE_LABEL: Record<string, string> = {
  hit: "Zwischenspeicher",
  miss: "frisch geladen",
  stale: "Quelle gestört",
  paused: "angehalten",
};

export function LiveSection({ pin }: { pin: string }) {
  const live = useMatchStore((s) => s.live);
  const { busy, run } = useAction();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState({
    league: "",
    season: "",
    suffix: "",
    paused: false,
    backup: ESPN_DEFAULT,
  });
  const [test, setTest] = useState<SourceTest | null>(null);
  // Eigener Schalter-Zustand, damit das Feld beim Leeren nicht verschwindet.
  const [espnOn, setEspnOn] = useState(true);

  const load = useCallback(async () => {
    const data = await run("config", () => fetchConfig(pin));
    if (!data) return;
    setConfig(data);
    const src = data.liveSource ?? { ...data.defaults, suffix: "", paused: false };
    setForm({
      league: src.league,
      season: src.season,
      suffix: src.suffix ?? "",
      paused: !!src.paused,
      backup: src.backup ?? ESPN_DEFAULT,
    });
    setEspnOn((src.backup ?? ESPN_DEFAULT) !== "");
  }, [pin, run]);
  useEffect(() => {
    void load();
  }, [load]);

  const url = `https://api.openligadb.de/getmatchdata/${form.league || "…"}/${form.season || "…"}${form.suffix ? `/${form.suffix}` : ""}`;
  const saved =
    config?.liveSource ?? (config ? { ...config.defaults, suffix: "", paused: false } : null);
  const dirty =
    !!saved &&
    (saved.league !== form.league ||
      saved.season !== form.season ||
      (saved.suffix ?? "") !== form.suffix ||
      !!saved.paused !== form.paused ||
      (saved.backup ?? ESPN_DEFAULT) !== form.backup);

  const reload = () =>
    run(
      "reload",
      async () => {
        await refreshLiveData({ force: true });
        return { ok: true as const, data: null };
      },
      "Daten neu geladen",
    );

  return (
    <div className="space-y-3 text-[13.5px]">
      <Card title="Status" text="Was die App gerade von der Live-Quelle bekommt.">
        <div className="grid grid-cols-2 gap-2">
          <Info label="Quelle" value={live.source ?? "–"} />
          <Info
            label="Zuletzt geladen"
            value={live.lastFetchAt ? new Date(live.lastFetchAt).toLocaleTimeString("de-DE") : "–"}
          />
          <Info
            label="Antwort"
            value={live.cache ? (CACHE_LABEL[live.cache] ?? live.cache) : "–"}
          />
          <Info
            label="Nicht zugeordnet"
            value={String(live.unmatched)}
            hint="Spiele ohne Treffer"
          />
        </div>
        <Info label="Fehler" value={live.lastError ?? "keiner"} />
        <div className="break-all rounded-xl bg-subtle px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
          {live.apiUrl ?? "noch keine Abfrage"}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton variant="primary" icon={<Zap />} busy={busy === "reload"} onClick={reload}>
            Sofort neu laden
          </ActionButton>
          <ActionButton
            icon={<Clock />}
            busy={busy === "fixtures"}
            onClick={() =>
              run(
                "fixtures",
                () =>
                  syncFixtures(
                    pin,
                    useMatchStore
                      .getState()
                      .tournament.matches.map((m) => ({ matchId: m.id, kickoffUtc: m.kickoffUtc })),
                  ),
                (d) => `${d.count} Anstoßzeiten übernommen`,
              )
            }
          >
            Anstoßzeiten abgleichen
          </ActionButton>
        </div>
      </Card>

      <Card
        title="API-Quellen"
        text="Liga-Kürzel, Saison und optional eine Endung (z. B. Spieltag-Nummer). Leer = ganze Saison. Gilt sofort für alle."
      >
        <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-2">
          <Field
            label="Liga"
            value={form.league}
            onChange={(v) => setForm({ ...form, league: v.toLowerCase() })}
            placeholder="em"
          />
          <Field
            label="Saison"
            value={form.season}
            onChange={(v) => setForm({ ...form, season: v.replace(/\D/g, "").slice(0, 4) })}
            placeholder="2028"
            inputMode="numeric"
          />
          <Field
            label="Endung"
            value={form.suffix}
            onChange={(v) => setForm({ ...form, suffix: v.replace(/\D/g, "").slice(0, 3) })}
            placeholder="–"
            inputMode="numeric"
          />
        </div>
        <div className="break-all rounded-xl bg-subtle px-3 py-2 font-mono text-[11.5px]">
          {url}
        </div>
        <div className="space-y-2 rounded-xl border border-border px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">Zweitquelle ESPN</div>
              <div className="text-[12px] text-muted-foreground">
                Kostenlos, meist schneller bei Toren. OpenLigaDB bleibt die Hauptquelle.
              </div>
            </div>
            <Switch
              checked={espnOn}
              onCheckedChange={(v) => {
                setEspnOn(v);
                setForm({ ...form, backup: v ? ESPN_DEFAULT : "" });
              }}
              aria-label="Zweitquelle ESPN"
            />
          </label>
          {espnOn && (
            <Field
              label="ESPN-Liga"
              value={form.backup}
              onChange={(v) => setForm({ ...form, backup: v.toLowerCase() })}
              placeholder={ESPN_DEFAULT}
            />
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          <div className="flex-1">
            <div className="font-semibold">Live-Abruf anhalten</div>
            <div className="text-[12px] text-muted-foreground">
              Nur gespeicherter Stand und Korrekturen – z. B. wenn die Quelle Unsinn liefert.
            </div>
          </div>
          <Switch
            checked={form.paused}
            onCheckedChange={(v) => setForm({ ...form, paused: v })}
            aria-label="Live-Abruf anhalten"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            icon={<FlaskConical />}
            busy={busy === "test"}
            onClick={async () => {
              setTest(null);
              const data = await run("test", () =>
                testLiveSource(pin, {
                  league: form.league,
                  season: form.season,
                  suffix: form.suffix,
                }),
              );
              if (data) setTest(data);
            }}
          >
            Testen
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={<Save />}
            busy={busy === "save"}
            disabled={!dirty}
            onClick={async () => {
              const ok = await run("save", () => saveLiveSource(pin, form), "Quelle gespeichert");
              if (ok) {
                await load();
                await refreshLiveData({ force: true });
              }
            }}
          >
            Speichern
          </ActionButton>
        </div>
        {config && (
          <button
            type="button"
            className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => (
              setEspnOn(true),
              setForm({ ...config.defaults, suffix: "", paused: false, backup: ESPN_DEFAULT })
            )}
          >
            Auf Standard zurücksetzen ({config.defaults.league}/{config.defaults.season})
          </button>
        )}
        {test && <TestResult test={test} />}
      </Card>

      <Card
        title="Zwischenspeicher & gespeicherte Ergebnisse"
        text="Beendete Spiele speichert der Server dauerhaft, damit spätere Fehler der Quelle sie nicht überschreiben."
      >
        <div className="grid grid-cols-2 gap-2">
          <Info
            label="Zwischenspeicher"
            value={config ? `${config.cache.length} Einträge` : "–"}
            hint={config?.cache[0] ? `Stand ${fmtTime(config.cache[0].fetched_at)}` : undefined}
          />
          <Info
            label="Gespeicherte Ergebnisse"
            value={config ? String(config.storedResults) : "–"}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon={<Database />}
            busy={busy === "cache"}
            onClick={async () => {
              if (await run("cache", () => clearLiveCache(pin), "Zwischenspeicher geleert")) {
                await load();
                await refreshLiveData({ force: true });
              }
            }}
          >
            Zwischenspeicher leeren
          </ActionButton>
          <ConfirmButton
            icon={<Trash2 />}
            variant="danger-outline"
            busy={busy === "results"}
            title="Gespeicherte Ergebnisse zurücksetzen?"
            text="Alle dauerhaft gespeicherten Endergebnisse werden gelöscht und beim nächsten Abruf neu von der Quelle geholt. Sinnvoll nach einem Test mit einer anderen Liga."
            confirm="Zurücksetzen"
            onConfirm={async () => {
              if (
                await run(
                  "results",
                  () => resetStoredResults(pin),
                  (d) => `${d.count ?? 0} Ergebnisse gelöscht`,
                )
              ) {
                await load();
                await refreshLiveData({ force: true });
              }
            }}
          >
            Ergebnisse zurücksetzen
          </ConfirmButton>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-10 w-full rounded-xl border border-border bg-subtle px-3 font-mono text-[14px] outline-none focus:border-primary"
      />
    </label>
  );
}

function TestResult({ test }: { test: SourceTest }) {
  const good = test.status === 200 && test.count > 0;
  return (
    <div
      className={cn(
        "space-y-1 rounded-xl border px-3 py-2.5 text-[12.5px]",
        good ? "border-primary/40 bg-primary/10" : "border-destructive/40 bg-destructive/10",
      )}
    >
      <div className="font-semibold">
        {good
          ? `${test.count} Spiele gefunden${test.finished ? `, ${test.finished} beendet` : ""}`
          : test.status === 200
            ? "Erreichbar, aber keine Spiele"
            : `Nicht erreichbar${test.status ? ` (HTTP ${test.status})` : ""}`}
      </div>
      {test.from && (
        <div className="text-muted-foreground">
          {fmtTime(test.from)} bis {fmtTime(test.to)}
        </div>
      )}
      {test.sample?.map((s) => (
        <div key={s} className="truncate text-muted-foreground">
          {s}
        </div>
      ))}
      {test.error && <div className="text-destructive">{test.error}</div>}
    </div>
  );
}
