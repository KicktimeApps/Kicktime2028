import { expect, type Page } from "@playwright/test";

export const GROUP = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "ABC123",
  name: "Bürorunde",
  isOwner: true,
  members: 3,
};

/** Gespeicherter App-Zustand: Einführung erledigt, Rundgänge gesehen. */
export function seedState(extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    state: {
      onboarded: true,
      favorites: ["GER"],
      interesting: [],
      tipsTourDone: true,
      roundTourDone: true,
      spoilerProtection: false,
      ...extra,
    },
  };
}

type Mock = {
  /** Antworten der Datenbank-Funktionen (RPC) nach Name. */
  rpc?: Record<string, unknown | ((body: Record<string, unknown>) => unknown)>;
  /** Antworten der Edge Function „admin“ nach Aktion. */
  admin?: Record<string, unknown>;
};

/**
 * Seite vorbereiten: Zustand setzen, Ladebildschirm überspringen, Server
 * nachstellen, fremde Adressen blockieren und Konsolenfehler sammeln.
 */
export async function setup(page: Page, opts: { state?: object | null; mock?: Mock } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text()))
      errors.push(m.text());
  });
  const state = opts.state === undefined ? seedState() : opts.state;
  await page.addInitScript((s) => {
    sessionStorage.setItem("kicktime-2028-splash", "1");
    if (s && !sessionStorage.getItem("e2e-seeded")) {
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem("kicktime-2028", JSON.stringify(s));
    }
  }, state);

  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
  // Alles außerhalb des Testservers blockieren – kein echter Server, keine Fremdseiten.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const req = route.request();
    const url = req.url();
    if (/supabase\.co\/rest\/v1\/rpc\//.test(url)) {
      const name = url.split("/rpc/")[1].split("?")[0];
      const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
      const def = opts.mock?.rpc?.[name];
      const res =
        typeof def === "function" ? def(body) : def !== undefined ? def : defaultRpc(name);
      return route.fulfill(json(res));
    }
    if (/supabase\.co\/rest\/v1\//.test(url)) return route.fulfill(json([]));
    if (/supabase\.co\/functions\/v1\/admin/.test(url)) {
      const body = (req.postDataJSON?.() ?? {}) as { action?: string };
      return route.fulfill(json(opts.mock?.admin?.[body.action ?? ""] ?? { ok: true }));
    }
    if (/supabase\.co\/functions\/v1\//.test(url))
      return route.fulfill(json({ fixtures: [], espn: "", cache: "hit" }));
    return route.abort();
  });
  return errors;
}

function defaultRpc(name: string): unknown {
  if (name === "kt_my_ban_status") return { global: false, requests: [] };
  if (name === "kt_tip_my_groups") return [];
  return null;
}

/** Kein seitliches Scrollen auf der Seite. */
export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "seitliches Scrollen").toBeLessThanOrEqual(0);
}
