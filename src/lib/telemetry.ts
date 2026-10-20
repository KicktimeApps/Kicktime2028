/**
 * Anonyme Nutzungs-Statistik (nur mit Backend): eine zufällige Geräte-ID,
 * App-Version, das erste Favoriten-Team sowie grob Plattform, Browser,
 * installiert ja/nein und Push ja/nein. Kein User-Agent, keine IP.
 *
 * Bots zählen nicht mit: bekannte Crawler/Automatisierung werden über den
 * User-Agent bzw. `navigator.webdriver` aussortiert, und gezählt wird erst,
 * wenn ein Mensch die App bedient (Tippen, Scrollen, Taste) oder sie
 * mindestens 20 Sekunden sichtbar geöffnet hat. Gezählt werden alle echten
 * Nutzer – nicht nur die mit Push.
 */
import { getSupabase } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { getDeviceId } from "./device-id";
import { detectInstallBrowser, isInstalledApp } from "./install";
import { APP_VERSION } from "./version";

const LAST_KEY = "kicktime-2028.last-ping";
const MIN_INTERVAL = 10 * 60_000;
const HUMAN_DELAY = 20_000;
const BOT_UA =
  /(bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|axios|node-fetch|go-http|java\/|phantom|selenium|puppeteer|playwright)/i;

let human = false;
let waiting: Promise<void> | null = null;

export function isLikelyBot(ua: string, webdriver: boolean): boolean {
  return webdriver || BOT_UA.test(ua);
}

/** Wartet auf das erste Zeichen eines echten Menschen. */
function humanPresence(): Promise<void> {
  if (human) return Promise.resolve();
  if (waiting) return waiting;
  waiting = new Promise<void>((resolve) => {
    const events = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;
    let timer = 0;
    const done = () => {
      human = true;
      events.forEach((e) => window.removeEventListener(e, done, true));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
      resolve();
    };
    // 20 Sekunden am Stück sichtbar zählen auch (Lesen ohne zu tippen).
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") timer = window.setTimeout(done, HUMAN_DELAY);
    };
    const onVisibility = () => arm();
    events.forEach((e) => window.addEventListener(e, done, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    arm();
  });
  return waiting;
}

function platformInfo(): { platform: string; browser: string } {
  const b = detectInstallBrowser({
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  if (b === "desktop") {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua)
      ? "edge"
      : /Firefox\//.test(ua)
        ? "firefox"
        : /Chrome\//.test(ua)
          ? "chrome"
          : /Safari\//.test(ua)
            ? "safari"
            : "other";
    return { platform: "desktop", browser };
  }
  if (b === "in-app")
    return { platform: /Android/.test(navigator.userAgent) ? "android" : "ios", browser: "inapp" };
  const [platform, browser] = b.split("-");
  return { platform, browser: browser === "other" ? "other" : browser };
}

export async function sendPing(): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (isLikelyBot(navigator.userAgent, navigator.webdriver === true)) return;
  if (navigator.doNotTrack === "1") return;
  await humanPresence();
  const sb = await getSupabase();
  if (!sb) return;
  const state = useAppStore.getState();
  if (state.demo.enabled) return;
  try {
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (Date.now() - last < MIN_INTERVAL) return;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    const { platform, browser } = platformInfo();
    const base = {
      p_client: getDeviceId(),
      p_version: APP_VERSION,
      p_fav: state.favorites[0] ?? null,
    };
    const { error } = await sb.rpc("kt_ping", {
      ...base,
      p_platform: platform,
      p_browser: browser,
      p_installed: isInstalledApp(),
      p_push: state.pushEnabled,
    });
    // SQL-Update „Admin-Ausbau“ noch nicht ausgeführt → alte Form
    if (error) await sb.rpc("kt_ping", base);
  } catch {
    /* Statistik ist unkritisch */
  }
}
