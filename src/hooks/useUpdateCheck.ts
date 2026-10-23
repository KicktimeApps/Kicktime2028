import { useEffect } from "react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/version";

const EVERY_MS = 15 * 60_000;
const MIN_GAP_MS = 2 * 60_000;

/** "2.10.1" > "2.9.0"? Nur echte neuere Versionen melden (kein Hinweis beim Zurückrollen). */
export function isNewer(remote: string, local: string): boolean {
  const a = remote.split(".").map(Number);
  const b = local.split(".").map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * Neue Version da? Wer die App vom Home-Bildschirm offen lässt, lädt sie sonst
 * erst beim kompletten Schließen neu. Fragt beim Zurückkehren in die App und
 * alle 15 Minuten nach und bietet dann „Aktualisieren“ an.
 */
export function useUpdateCheck() {
  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined") return;
    let last = 0;
    let shown = "";
    const check = async () => {
      if (Date.now() - last < MIN_GAP_MS || document.visibilityState !== "visible") return;
      last = Date.now();
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === shown || !isNewer(version, APP_VERSION)) return;
        shown = version;
        toast("Neue Version ist da", {
          id: "update",
          description: `KickTime ${version} – mit Verbesserungen und Korrekturen.`,
          duration: Infinity,
          action: { label: "Aktualisieren", onClick: () => window.location.reload() },
        });
      } catch {
        /* offline – später noch mal */
      }
    };
    const first = window.setTimeout(check, 20_000);
    const timer = window.setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
}
