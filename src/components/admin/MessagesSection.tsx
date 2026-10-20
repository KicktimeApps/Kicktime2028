import { BellRing, Megaphone, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Segmented } from "@/components/common/Segmented";
import { getDeviceId } from "@/lib/device-id";
import { fetchConfig, fetchStats, saveAnnouncement, sendBroadcast } from "@/services/admin";
import { refreshAnnouncement, type Announcement } from "@/services/announcement";
import { useAppStore } from "@/store/app-store";
import { ActionButton, Card, ConfirmButton } from "./shared";
import { fmtTime, useAction } from "./use-action";

const TONES: { value: Announcement["tone"]; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "warn", label: "Achtung" },
  { value: "success", label: "Gute Nachricht" },
];

const TARGETS = [
  { value: "/", label: "Start" },
  { value: "/spielplan", label: "Spielplan" },
  { value: "/tipps", label: "Tipps" },
  { value: "/turnier", label: "Turnier" },
];

/** ISO → Wert für <input type="datetime-local"> in lokaler Zeit. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function MessagesSection({ pin }: { pin: string }) {
  const { busy, run } = useAction();
  const pushEnabled = useAppStore((s) => s.pushEnabled);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Announcement["tone"]>("info");
  const [until, setUntil] = useState("");
  const [subs, setSubs] = useState<number | null>(null);
  const [push, setPush] = useState({ title: "", body: "", url: "/" });

  const load = useCallback(async () => {
    const [cfg, stats] = await Promise.all([fetchConfig(pin), fetchStats(pin)]);
    if (cfg.ok) {
      const a = cfg.data.announcement;
      setCurrent(a);
      setText(a?.text ?? "");
      setTone(a?.tone ?? "info");
      setUntil(toLocalInput(a?.until ?? null));
    }
    if (stats.ok) setSubs(stats.data.push?.subscriptions ?? null);
  }, [pin]);
  useEffect(() => {
    void load();
  }, [load]);

  const saveBanner = async (remove = false) => {
    const ok = await run(
      remove ? "remove" : "banner",
      () =>
        saveAnnouncement(pin, {
          text: remove ? "" : text,
          tone,
          until: !remove && until ? new Date(until).toISOString() : null,
        }),
      remove ? "Hinweis entfernt" : "Hinweis ist jetzt für alle sichtbar",
    );
    if (ok) {
      await load();
      await refreshAnnouncement();
    }
  };

  const broadcast = (onlyMe: boolean) =>
    run(
      onlyMe ? "test" : "all",
      () =>
        sendBroadcast(pin, {
          ...push,
          onlyDevice: onlyMe ? getDeviceId() : undefined,
        }),
      (d) =>
        onlyMe
          ? d.sent > 0
            ? "Test-Mitteilung gesendet"
            : "Dieses Gerät hat keine Mitteilungen aktiviert"
          : `An ${d.sent} von ${d.total} Geräten gesendet${d.cleaned ? ` · ${d.cleaned} abgelaufene entfernt` : ""}`,
    );

  const pushReady = push.title.trim().length > 0 && push.body.trim().length > 0;

  return (
    <div className="space-y-3 text-[13.5px]">
      <Card
        title="Hinweis in der App"
        text="Erscheint oben auf jeder Seite für alle – z. B. bei Störungen oder Neuigkeiten. Nutzer können ihn wegklicken."
        action={<Megaphone className="h-5 w-5 text-primary" />}
      >
        {current && (
          <div className="rounded-xl bg-primary/10 px-3 py-2 text-[12.5px]">
            <b>Aktiv</b> seit {fmtTime(current.id)}
            {current.until ? ` · bis ${fmtTime(current.until)}` : " · ohne Ende"}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="z. B. Die Live-Ergebnisse kommen gerade verzögert – wir sind dran."
          className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[14px] outline-none focus:border-primary"
        />
        <div className="flex justify-between text-[11.5px] text-muted-foreground">
          <span>Max. 280 Zeichen</span>
          <span className="tabular">{text.length}/280</span>
        </div>
        <Segmented<Announcement["tone"]>
          size="sm"
          value={tone}
          onChange={setTone}
          options={TONES}
        />
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] text-muted-foreground">
            Automatisch ausblenden ab (optional)
          </span>
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            // iOS gibt Datumsfeldern eine eigene Mindestbreite – ohne appearance/min-w ragen sie über den Rand.
            className="block h-10 w-full min-w-0 max-w-full appearance-none rounded-xl border border-border bg-subtle px-3 text-left text-[14px] outline-none focus:border-primary [&::-webkit-date-and-time-value]:text-left"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            variant="danger-outline"
            icon={<Trash2 />}
            busy={busy === "remove"}
            disabled={!current}
            onClick={() => saveBanner(true)}
          >
            Entfernen
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={<Megaphone />}
            busy={busy === "banner"}
            disabled={text.trim().length < 3}
            onClick={() => saveBanner()}
          >
            {current ? "Aktualisieren" : "Anzeigen"}
          </ActionButton>
        </div>
      </Card>

      <Card
        title="Mitteilung an alle"
        text={
          <>
            Push-Nachricht an alle Geräte mit eingeschalteten Mitteilungen
            {subs != null && (
              <>
                {" "}
                – aktuell <b className="text-foreground">{subs}</b>
              </>
            )}
            . Sparsam einsetzen, sonst schalten die Leute sie ab.
          </>
        }
        action={<BellRing className="h-5 w-5 text-primary" />}
      >
        <input
          value={push.title}
          onChange={(e) => setPush({ ...push, title: e.target.value.slice(0, 60) })}
          placeholder="Titel, z. B. Die Auslosung ist da! 🎉"
          className="h-10 w-full rounded-xl border border-border bg-subtle px-3 text-[14px] outline-none focus:border-primary"
        />
        <textarea
          value={push.body}
          onChange={(e) => setPush({ ...push, body: e.target.value.slice(0, 180) })}
          rows={2}
          placeholder="Text, z. B. Alle 51 Spiele stehen fest – schau, wann deine Teams spielen."
          className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[14px] outline-none focus:border-primary"
        />
        <div>
          <div className="mb-1 text-[12px] text-muted-foreground">Beim Antippen öffnen</div>
          <Segmented
            size="sm"
            value={push.url}
            onChange={(url) => setPush({ ...push, url })}
            options={TARGETS}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            icon={<BellRing />}
            busy={busy === "test"}
            disabled={!pushReady || !pushEnabled}
            onClick={() => broadcast(true)}
          >
            Test an mich
          </ActionButton>
          <ConfirmButton
            variant="primary"
            icon={<Send />}
            busy={busy === "all"}
            disabled={!pushReady}
            title="Mitteilung an alle senden?"
            text={`„${push.title}“ geht an ${subs ?? "alle"} Geräte. Zurückholen geht nicht.`}
            confirm="Senden"
            onConfirm={() => void broadcast(false)}
          >
            An alle
          </ConfirmButton>
        </div>
        {!pushEnabled && (
          <p className="text-[11.5px] text-muted-foreground">
            Für „Test an mich“ auf diesem Gerät erst Erinnerungen in den Einstellungen einschalten.
          </p>
        )}
      </Card>
    </div>
  );
}
