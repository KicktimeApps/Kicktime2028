import { BellRing, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { getDeviceId } from "@/lib/device-id";
import { teamDevice, type TeamDeviceState } from "@/services/admin";
import { useAppStore } from "@/store/app-store";
import { useAction } from "./use-action";

/**
 * Team-Mitteilungen (neue Anträge, Wächter) an dieses Gerät – nur Geräte, die
 * hier mit der PIN eingetragen werden. Kein anderes Gerät kann sich selbst
 * eintragen. Warnt, wenn eingetragene Geräte keine Mitteilungen empfangen
 * können (z. B. App neu installiert → neue Geräte-ID).
 */
export function TeamDeviceRow({ pin }: { pin: string }) {
  const pushEnabled = useAppStore((s) => s.pushEnabled);
  const { busy, run } = useAction();
  const [state, setState] = useState<TeamDeviceState | null>(null);
  const device = getDeviceId();
  useEffect(() => {
    void teamDevice(pin, device, "").then((r) => r.ok && setState(r.data));
  }, [pin, device]);
  const set = async (mode: "on" | "off" | "only", msg: string) => {
    const res = await run("device", () => teamDevice(pin, device, mode), msg);
    if (res) setState(res);
  };

  // Ältere Server-Version kennt reachable/selfPush noch nicht → keine Warnung.
  const dead = state?.reachable !== undefined ? Math.max(0, state.count - state.reachable) : 0;
  const warning = !pushEnabled
    ? "Auf diesem Gerät sind Mitteilungen aus – erst in den Einstellungen unter Erinnerungen einschalten."
    : state?.registered && state.selfPush === false
      ? "Dieses Gerät ist eingetragen, hat aber kein Mitteilungs-Abo. Einmal die App neu öffnen oder Erinnerungen aus- und wieder einschalten."
      : state && state.count > 0 && state.reachable === 0
        ? "Kein eingetragenes Gerät kann Mitteilungen empfangen – dieses Gerät eintragen."
        : null;

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 px-3 py-2.5">
      <label className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[13.5px] font-medium">
          Team-Mitteilungen an dieses Gerät
        </span>
        <Switch
          checked={!!state?.registered}
          disabled={!state || !pushEnabled || busy === "device"}
          onCheckedChange={(v) =>
            set(v ? "on" : "off", v ? "Dieses Gerät bekommt Mitteilungen" : "Ausgeschaltet")
          }
          aria-label="Team-Mitteilungen an dieses Gerät"
        />
      </label>
      {state && state.count > 0 && (
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {state.count} {state.count === 1 ? "Gerät eingetragen" : "Geräte eingetragen"}
            {state.registered ? " (auch dieses)" : ""}
            {dead > 0 && `, ${dead} davon ohne Mitteilungen`}
          </span>
          {state.registered && state.count > 1 && (
            <button
              type="button"
              onClick={() => set("only", "Nur noch dieses Gerät")}
              className="shrink-0 font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Nur dieses Gerät
            </button>
          )}
        </div>
      )}
      {warning && (
        <p className="flex gap-2 text-[12.5px] text-gold">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
    </div>
  );
}
