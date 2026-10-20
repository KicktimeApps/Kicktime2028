import { BellRing, Check, Clock, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { hasPushBackend } from "@/lib/push";
import { enableReminders } from "@/lib/reminders";
import { useAppStore } from "@/store/app-store";

export function PushStep() {
  const enabled = useAppStore((s) => s.pushEnabled);
  const autoFavorites = useAppStore((s) => s.autoAlarmFavorites);
  const setAutoFavorites = useAppStore((s) => s.setAutoAlarmFavorites);
  const [busy, setBusy] = useState(false);
  const background = hasPushBackend();

  return (
    <>
      <div className="mb-5">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-5 [&_svg]:w-5">
          <BellRing />
        </div>
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-tight">
          Nichts verpassen
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          KickTime meldet sich nur, wenn es wirklich wichtig ist
          {background ? " – auch wenn die App geschlossen ist." : "."}
        </p>
      </div>

      <ul className="mb-7 space-y-4">
        {[
          {
            icon: <Clock />,
            title: "15 Minuten vor Anpfiff",
            text: "Für die Spiele deiner Teams und alle, bei denen du die Glocke antippst.",
          },
          {
            icon: <Users />,
            title: "Deine Tipprunden",
            text: "Wenn jemand deiner Runde beitreten möchte.",
          },
        ].map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]">
              {f.icon}
            </span>
            <div>
              <div className="text-[15px] font-semibold">{f.title}</div>
              <div className="text-[13.5px] text-muted-foreground">{f.text}</div>
            </div>
          </li>
        ))}
      </ul>

      {enabled ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/10">
          <div className="flex items-center gap-3 p-4">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold">Mitteilungen sind an</span>
          </div>
          <label className="flex cursor-pointer items-center gap-3 border-t border-primary/20 px-4 py-3.5">
            <span className="flex-1">
              <span className="block text-[14.5px] font-medium">Alle Spiele meiner Favoriten</span>
              <span className="block text-[12.5px] text-muted-foreground">
                Ohne Glocke automatisch erinnern
              </span>
            </span>
            <Switch
              checked={autoFavorites}
              onCheckedChange={setAutoFavorites}
              aria-label="Automatisch für alle Spiele meiner Favoriten"
            />
          </label>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await enableReminders();
              setBusy(false);
            }}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellRing className="h-5 w-5" />}
            Mitteilungen erlauben
          </button>
          <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
            Dein Gerät fragt gleich nach – dort „Erlauben“ tippen. Jederzeit in den Einstellungen
            änderbar.
          </p>
        </>
      )}
    </>
  );
}
