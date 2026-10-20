import { RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { cn } from "@/lib/utils";
import {
  deleteFeedback,
  fetchFeedback,
  fetchStats,
  type FeedbackRow,
  type Stats,
  type StatsExt,
} from "@/services/admin";
import { Card, ConfirmButton, Info } from "./shared";
import { useAction } from "./use-action";

const PLATFORM: Record<string, string> = {
  ios: "iPhone/iPad",
  android: "Android",
  desktop: "Computer",
  other: "Sonstige",
  unbekannt: "unbekannt (alte Version)",
};
const BROWSER: Record<string, string> = {
  safari: "Safari",
  chrome: "Chrome",
  firefox: "Firefox",
  edge: "Edge",
  samsung: "Samsung Internet",
  opera: "Opera",
  inapp: "In-App (Instagram & Co.)",
  other: "Sonstige",
  unbekannt: "unbekannt (alte Version)",
};

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)} %` : "–";

const CATEGORY_LABEL: Record<string, string> = {
  idee: "💡 Idee",
  fehler: "🐞 Fehler",
  lob: "💚 Lob",
  sonstiges: "💬 Sonstiges",
};

export function StatsSection({ pin }: { pin: string }) {
  const { busy, run } = useAction();
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [s, f] = await Promise.all([fetchStats(pin), fetchFeedback(pin)]);
    setLoading(false);
    if (s.ok) setStats(s.data);
    if (f.ok) setFeedback(f.data.rows);
  }, [pin]);
  useEffect(() => {
    void load();
  }, [load]);

  const ext = stats?.ext ?? null;

  return (
    <div className="space-y-3 text-[13.5px]">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[12.5px] text-muted-foreground">
          Gezählt wird jedes Gerät, das die App wirklich benutzt – mit oder ohne Mitteilungen. Bots,
          Link-Vorschauen und automatisierte Browser zählen nicht.
        </p>
        <button
          type="button"
          onClick={load}
          aria-label="Aktualisieren"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {ext ? <Usage ext={ext} push={stats?.push} /> : <BasicUsage stats={stats} />}

      <Card
        title={`Feedback${feedback.length ? ` (${feedback.length})` : ""}`}
        action={
          feedback.length > 0 && (
            <ConfirmButton
              variant="danger-outline"
              className="h-8 px-2.5 text-[12.5px]"
              icon={<Trash2 />}
              busy={busy === "fb-all"}
              title="Alles Feedback löschen?"
              text="Alle Einträge werden endgültig gelöscht."
              confirm="Alle löschen"
              onConfirm={async () => {
                if (await run("fb-all", () => deleteFeedback(pin, "all"), "Feedback gelöscht"))
                  await load();
              }}
            >
              Alle löschen
            </ConfirmButton>
          )
        }
      >
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {feedback.length === 0 && <li className="text-muted-foreground">Noch kein Feedback.</li>}
          {feedback.map((f, i) => (
            <li key={f.id ?? i} className="flex gap-2 rounded-lg bg-subtle px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                {f.category && (
                  <span className="mr-1 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-semibold">
                    {CATEGORY_LABEL[f.category] ?? f.category}
                  </span>
                )}
                {f.rating == null ? "" : f.rating > 0 ? "👍 " : f.rating < 0 ? "👎 " : "😐 "}
                {f.message ?? <span className="text-muted-foreground">ohne Text</span>}
                <span className="block text-[11px] text-muted-foreground">
                  {new Date(f.created_at).toLocaleString("de-DE")} · v{f.app_version}
                </span>
              </div>
              {f.id != null && (
                <button
                  type="button"
                  aria-label="Feedback löschen"
                  onClick={async () => {
                    if (await run(`fb-${f.id}`, () => deleteFeedback(pin, f.id!))) await load();
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Usage({ ext, push }: { ext: StatsExt; push?: Stats["push"] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Info label="Jetzt online" value={String(ext.online)} hint="letzte 10 Min." />
        <Info label="Heute" value={String(ext.today)} />
        <Info label="7 Tage" value={String(ext.week)} />
        <Info label="30 Tage" value={String(ext.month)} />
        <Info label="Gesamt" value={String(ext.total)} hint="seit Start" />
        <Info label="Neu" value={String(ext.new7)} hint="letzte 7 Tage" />
        <Info label="Wiederkehrend" value={String(ext.returning7)} hint="aktiv, älter als 7 T." />
        <Info label="24 Stunden" value={String(ext.day)} />
      </div>

      <Card title="Nutzer pro Tag" text="Verschiedene Geräte je Tag, letzte 14 Tage.">
        <DailyBars daily={ext.daily} />
      </Card>

      <Card title="Wie die App genutzt wird" text="Bezogen auf alle Geräte der letzten 30 Tage.">
        <div className="grid grid-cols-2 gap-2">
          <Info
            label="Installiert"
            value={pct(ext.installed, ext.month)}
            hint={`${ext.installed} Geräte`}
          />
          <Info
            label="Mitteilungen an"
            value={pct(ext.pushOn, ext.month)}
            hint={`${ext.pushOn} Geräte`}
          />
        </div>
        {push && (
          <div className="grid grid-cols-3 gap-2">
            <Info label="Abos" value={String(push.subscriptions)} />
            <Info label="Geplant" value={String(push.upcoming)} />
            <Info label="Ges. 24 h" value={String(push.sent24h)} />
          </div>
        )}
        <Distribution title="Geräte" data={ext.platforms} labels={PLATFORM} />
        <Distribution title="Browser" data={ext.browsers} labels={BROWSER} />
        <Distribution
          title="App-Versionen"
          data={Object.fromEntries(ext.versions.map((v) => [`v${v.version}`, v.count]))}
        />
      </Card>

      {ext.topTeams.length > 0 && (
        <Card title="Top-Favoriten">
          <ul className="space-y-1">
            {ext.topTeams.map((t) => (
              <li key={t.team} className="flex items-center gap-2">
                <Flag flag={teamDisplay(t.team, "").flag} size="xs" />{" "}
                {teamDisplay(t.team, t.team).name}
                <span className="ml-auto tabular text-muted-foreground">{t.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Ohne SQL-Update „Admin-Ausbau“: nur die Grundzahlen. */
function BasicUsage({ stats }: { stats: Stats | null }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Info label="Jetzt online" value={String(stats?.online ?? "–")} />
        <Info label="24 Stunden" value={String(stats?.day ?? "–")} />
        <Info label="7 Tage" value={String(stats?.week ?? "–")} />
        <Info label="Gesamt" value={String(stats?.total ?? "–")} />
      </div>
      {stats && (
        <p className="rounded-xl bg-subtle p-3 text-[12.5px] text-muted-foreground">
          Für Tagesverlauf, Geräte, Browser und Versionen das SQL-Update „Admin-Ausbau“ ausführen
          und die Funktion „admin“ neu deployen.
        </p>
      )}
    </>
  );
}

/** Säulen je Tag – Wert beim Antippen/Überfahren, Höchstwert und heute beschriftet. */
function DailyBars({ daily }: { daily: StatsExt["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.count));
  const peak = daily.reduce((best, d, i) => (d.count > daily[best].count ? i : best), 0);
  const fmt = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
  const shown = active ?? daily.length - 1;
  if (daily.length === 0) return <p className="text-muted-foreground">Noch keine Daten.</p>;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted-foreground">{fmt(daily[shown].day)}</span>
        <span className="font-semibold tabular">
          {daily[shown].count} {daily[shown].count === 1 ? "Gerät" : "Geräte"}
        </span>
      </div>
      <div
        className="flex h-28 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label={`Nutzer pro Tag: ${daily.map((d) => `${fmt(d.day)} ${d.count}`).join(", ")}`}
        onMouseLeave={() => setActive(null)}
      >
        {daily.map((d, i) => (
          <button
            key={d.day}
            type="button"
            title={`${fmt(d.day)}: ${d.count}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className="relative flex h-full flex-1 items-end"
          >
            {(i === peak || i === daily.length - 1) && d.count > 0 && (
              <span
                className="absolute inset-x-0 text-center text-[10px] text-muted-foreground tabular"
                style={{ bottom: `calc(${(d.count / max) * 82}% + 2px)` }}
              >
                {d.count}
              </span>
            )}
            <span
              className={cn(
                "w-full rounded-t-[4px] bg-primary transition-opacity",
                shown === i ? "opacity-100" : "opacity-60",
              )}
              style={{ height: `${Math.max(d.count > 0 ? 3 : 0, (d.count / max) * 82)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{fmt(daily[0].day)}</span>
        <span>heute</span>
      </div>
    </div>
  );
}

function Distribution({
  title,
  data,
  labels,
}: {
  title: string;
  data: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0);
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1.5">
        {rows.map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between text-[12.5px]">
              <span className="truncate">{labels?.[k] ?? k}</span>
              <span className="shrink-0 tabular text-muted-foreground">
                {v} · {pct(v, total)}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(v / total) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
