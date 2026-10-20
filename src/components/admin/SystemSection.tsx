import { LogOut, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getDeviceId } from "@/lib/device-id";
import { clearErrors, getErrors, subscribeErrors } from "@/lib/error-log";
import { isInstalledApp } from "@/lib/install";
import { APP_VERSION } from "@/lib/version";
import { isBackendConfigured } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { ActionButton, Card, Info } from "./shared";

export function SystemSection({ onLock }: { onLock: () => void }) {
  const errors = useSyncExternalStore(subscribeErrors, getErrors, getErrors);
  const pushEnabled = useAppStore((s) => s.pushEnabled);
  return (
    <div className="space-y-3 text-[13.5px]">
      <Card title="Dieses Gerät">
        <div className="grid grid-cols-2 gap-2">
          <Info label="App-Version" value={`v${APP_VERSION}`} />
          <Info label="Backend" value={isBackendConfigured() ? "verbunden" : "keins"} />
          <Info label="Installiert" value={isInstalledApp() ? "ja" : "nein (Browser)"} />
          <Info label="Mitteilungen" value={pushEnabled ? "an" : "aus"} />
        </div>
        <Info label="Geräte-ID" value={getDeviceId()} hint="Anonym, nur auf diesem Gerät" />
      </Card>

      <Card
        title={`Fehlerprotokoll (${errors.length})`}
        text="Fehler, die auf diesem Gerät aufgetreten sind."
        action={
          errors.length > 0 && (
            <ActionButton
              variant="outline"
              className="h-8 px-2.5 text-[12.5px]"
              icon={<Trash2 />}
              onClick={clearErrors}
            >
              Leeren
            </ActionButton>
          )
        }
      >
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-subtle p-2 font-mono text-[11.5px]">
          {errors.length === 0 && <li className="text-muted-foreground">Keine Fehler 🎉</li>}
          {errors.map((e, i) => (
            <li key={i} className="break-words">
              <span className="text-muted-foreground">
                {new Date(e.ts).toLocaleString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>{" "}
              <span className="text-primary">[{e.category}]</span> {e.message}
            </li>
          ))}
        </ul>
      </Card>

      <ActionButton className="w-full" icon={<LogOut />} onClick={onLock}>
        Admin sperren
      </ActionButton>
    </div>
  );
}
