/**
 * „Zum Home-Bildschirm hinzufügen“ – Gerät und Browser erkennen.
 *
 * Android-Browser auf Chromium-Basis melden `beforeinstallprompt`; dann zeigt
 * die App einen echten Installieren-Knopf. Das Ereignis kommt oft schon kurz
 * nach dem Laden, deshalb hört dieses Modul ab dem ersten Import mit.
 * Alle anderen Browser bekommen eine passende Schritt-für-Schritt-Anleitung.
 */
import { useSyncExternalStore } from "react";

export type InstallBrowser =
  | "ios-safari"
  | "ios-chrome"
  | "ios-firefox"
  | "ios-edge"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-edge"
  | "android-opera"
  | "android-other"
  | "in-app"
  | "desktop";

export interface InstallEnv {
  ua: string;
  /** iPadOS meldet sich als Mac – erkennbar an Touch. */
  maxTouchPoints?: number;
}

export function detectInstallBrowser({ ua, maxTouchPoints = 0 }: InstallEnv): InstallBrowser {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (!ios && !android) return "desktop";
  // Eingebaute Browser von Social-Apps können nichts installieren.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|musical_ly|BytedanceWebview|Snapchat|LinkedInApp/.test(ua))
    return "in-app";
  if (ios) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS/.test(ua)) return "ios-firefox";
    if (/EdgiOS/.test(ua)) return "ios-edge";
    if (/Safari/.test(ua) && !/GSA\//.test(ua)) return "ios-safari";
    return "ios-other";
  }
  if (/SamsungBrowser/.test(ua)) return "android-samsung";
  if (/Firefox/.test(ua)) return "android-firefox";
  if (/EdgA/.test(ua)) return "android-edge";
  if (/OPR\//.test(ua)) return "android-opera";
  if (/Chrome\//.test(ua) && !/; wv\)/.test(ua)) return "android-chrome";
  return "android-other";
}

/** Läuft die App schon als installierte App (Home-Bildschirm)? */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

/** Der Installieren-Schritt erscheint nur im Browser auf Handy oder Tablet. */
export function shouldOfferInstall(): boolean {
  if (typeof window === "undefined" || isInstalledApp()) return false;
  return (
    detectInstallBrowser({
      ua: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    }) !== "desktop"
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // eigene Schaltfläche statt Browser-Leiste
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

type PromptState = "unavailable" | "ready" | "installed";

const snapshot = (): PromptState => (installed ? "installed" : deferred ? "ready" : "unavailable");

/** Ob der Browser einen direkten Installieren-Dialog anbietet. */
export function useInstallPrompt(): PromptState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "unavailable",
  );
}

/** Öffnet den Installieren-Dialog des Browsers. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // jedes Ereignis lässt sich nur einmal verwenden
  emit();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === "accepted") {
      installed = true;
      emit();
    }
    return outcome === "accepted";
  } catch {
    return false;
  }
}
