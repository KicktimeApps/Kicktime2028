import { useCallback, useState } from "react";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Führt eine Admin-Aktion aus: Lade-Zustand, Haptik und Meldung inklusive.
 * Gibt die Daten zurück (oder null bei Fehler).
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T>(
      key: string,
      fn: () => Promise<Result<T>>,
      success?: string | ((data: T) => string),
    ): Promise<T | null> => {
      setBusy(key);
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        haptics.warn();
        toast.error("Fehler", { description: res.error });
        return null;
      }
      if (success) {
        haptics.success();
        toast.success(typeof success === "function" ? success(res.data) : success);
      }
      return res.data;
    },
    [],
  );
  return { busy, run };
}

export const fmtTime = (iso: string | number | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "–";
