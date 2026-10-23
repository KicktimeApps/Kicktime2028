import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SPLASH_MIN_MS, SPLASH_MS, SplashScreen } from "@/components/layout/SplashScreen";
import { MatchSheet } from "@/components/match/MatchSheet";
import { TeamSheet } from "@/components/team/TeamSheet";
import { GroupNotice } from "@/components/tipgroups/GroupNotice";
import { UnbanNotice } from "@/components/tipgroups/UnbanNotice";
import { ChampionCelebration } from "@/components/tournament/ChampionCelebration";
import { Toaster } from "@/components/ui/sonner";
import { useEngine } from "@/hooks/useEngine";
import { useGoalAlerts } from "@/hooks/useGoalAlerts";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { takeRestored } from "@/lib/device-id";
import { installPressFeedback } from "@/lib/press-feedback";
import { TIP_GROUPS_KEY } from "@/hooks/useMyGroups";
import { logError } from "@/lib/error-log";
// Früh mithören: Android meldet die Installierbarkeit oft schon beim Laden.
import "@/lib/install";
import { sendPing } from "@/lib/telemetry";
import { isBackendConfigured } from "@/services/supabase";
import { useAppStore } from "@/store/app-store";
import { useMatchStore } from "@/store/match-store";
import { SITE_URL, TOURNAMENT } from "@/tournament/config";

import appCss from "../styles.css?url";

// Nur beim allerersten Start gebraucht – nicht in jedes Laden packen.
const OnboardingFlow = lazy(() =>
  import("@/components/onboarding/OnboardingFlow").then((m) => ({ default: m.OnboardingFlow })),
);

const TITLE = `KickTime ${TOURNAMENT.year} – Dein persönlicher EM-Planer`;
const DESCRIPTION =
  "Wähle deine Teams und deine freien Zeiten – KickTime zeigt dir, welche Spiele der EURO 2028 in deinen Alltag passen. Spoilerfrei, mit Live-Tabellen, K.-o.-Baum und Tipps.";

/**
 * Setzt Dark/Light-Klasse vor dem ersten Paint (kein Aufblitzen).
 * Liest die gespeicherte Einstellung direkt aus localStorage.
 */
/**
 * Startbilder für die Home-Bildschirm-App auf dem iPhone – exakt der erste
 * Moment der Öffnungsanimation, damit kein weißer Blitz entsteht. iOS braucht
 * je Gerätegröße ein eigenes Bild (hell und dunkel, erzeugt aus SplashScreen).
 */
const STARTUP_DEVICES: [number, number, number][] = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [414, 896, 3],
  [414, 896, 2],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 736, 3],
  [375, 667, 2],
];
const STARTUP_IMAGES = STARTUP_DEVICES.flatMap(([w, h, dpr]) =>
  (["dark", "light"] as const).map((scheme) => ({
    rel: "apple-touch-startup-image",
    href: `/startup/startup-${w}x${h}@${dpr}-${scheme}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
  })),
);

const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("${TOURNAMENT.storagePrefix}")||"{}").state||{};var t=s.theme||"system";if(t==="system"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.classList.toggle("text-large",!!s.largeText)}catch(e){}})();`;

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="font-display text-7xl font-bold text-primary">404</div>
      <p className="mt-2 text-muted-foreground">Abseits! Diese Seite gibt es nicht.</p>
      <Link
        to="/"
        className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Zur Startseite
      </Link>
    </div>
  );
}

function ErrorView({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // Geworfen werden kann alles, nicht nur Error-Objekte.
  useEffect(
    () => logError("render", error instanceof Error ? error.message : String(error)),
    [error],
  );
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl font-bold uppercase">Foul im Code</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Da ist etwas schiefgelaufen. Deine Einstellungen sind sicher gespeichert.
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Erneut versuchen
      </button>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      // Bewusst KEIN apple-mobile-web-app-capable / status-bar-style: Damit
      // startet iOS die Home-Bildschirm-App im alten Vollbildmodus, der Inhalt
      // rutscht unter die Statusleiste und wird dort weichgezeichnet. Ohne die
      // Tags gilt das Manifest (display: standalone) – wie bei KickTime 2026.
      { name: "theme-color", content: "#0b1122" },
      // Vorschlag für den Namen auf dem Home-Bildschirm (iPhone)
      { name: "apple-mobile-web-app-title", content: `KickTime ${TOURNAMENT.year}` },
      { name: "application-name", content: `KickTime ${TOURNAMENT.year}` },
      { property: "og:site_name", content: `KickTime ${TOURNAMENT.year}` },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      // Bild, Adresse und Kartentyp ergänzt der Server mit vollständiger Adresse (share-meta.ts).
      ...(SITE_URL ? [{ property: "og:image", content: `${SITE_URL}/og-app.png` }] : []),
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ...STARTUP_IMAGES,
    ],
    scripts: [{ children: THEME_BOOT }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Wartet, bis der persistierte Zustand aus localStorage geladen ist. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = useAppStore.persist;
    const done = () => {
      // Demo-Zustand sofort übernehmen, damit nichts kurz „echt“ aufblitzt.
      useMatchStore.getState().setDemo(useAppStore.getState().demo);
      setHydrated(true);
    };
    if (p.hasHydrated()) done();
    return p.onFinishHydration(done);
  }, []);
  return hydrated;
}

const SPLASH_KEY = `${TOURNAMENT.storagePrefix}-splash`;

/**
 * Öffnungsanimation einmal pro Sitzung. Sie ist schon im Server-HTML enthalten
 * und wird zum Laden genutzt: Sie endet, sobald das Wichtigste da ist
 * ({@link useStartupReady}) – frühestens nach {@link SPLASH_MIN_MS} (Logo und
 * Schriftzug fertig animiert), spätestens nach {@link SPLASH_MS}. Sofort weg,
 * wenn sie in dieser Sitzung schon lief bzw. das Gerät reduzierte Bewegung wünscht.
 */
function useSplash(isReady: () => boolean) {
  const [show, setShow] = useState(true);
  const ready = useRef(isReady);
  ready.current = isReady;
  useEffect(() => {
    let seen = false;
    try {
      seen =
        sessionStorage.getItem(SPLASH_KEY) === "1" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* noop */
    }
    if (seen) {
      setShow(false);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= SPLASH_MS || (elapsed >= SPLASH_MIN_MS && ready.current())) {
        window.clearInterval(id);
        setShow(false);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return show;
}

/** Hauptseiten, die während der Öffnungsanimation schon vorgeladen werden. */
const PRELOAD_ROUTES = ["/", "/spielplan", "/turnier", "/tipps", "/einstellungen"] as const;

/**
 * Was beim Start da sein soll, bevor die App erscheint: frische Live-Daten
 * (nicht nur der gespeicherte Stand), die eigenen Tipprunden und der Code der
 * Hauptseiten. Fehler zählen als „fertig“ – dann zeigt die App ihren Hinweis.
 */
function useStartupReady(hydrated: boolean, queryClient: QueryClient) {
  const router = useRouter();
  const [pagesLoaded, setPagesLoaded] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    void Promise.allSettled(PRELOAD_ROUTES.map((to) => router.preloadRoute({ to }))).then(() =>
      setPagesLoaded(true),
    );
  }, [hydrated, router]);
  return () => {
    if (!hydrated || !pagesLoaded) return false;
    const app = useAppStore.getState();
    const live = useMatchStore.getState().live;
    const liveReady =
      app.demo.enabled || !!live.lastError || (!!live.lastFetchAt && live.source !== "cache");
    // Tipprunden lädt die App erst nach der Einführung.
    const groups = queryClient.getQueryState(TIP_GROUPS_KEY)?.status;
    const groupsReady =
      !app.onboarded || !isBackendConfigured() || groups === "success" || groups === "error";
    return liveReady && groupsReady;
  };
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrated = useHydrated();
  const splash = useSplash(useStartupReady(hydrated, queryClient));
  const ready = hydrated && !splash;
  return (
    <QueryClientProvider client={queryClient}>
      {hydrated && (
        // Nur Deckkraft – eine Verschiebung (transform) würde fest platzierte
        // Elemente wie die Leiste unten an den Seitenrand statt an den
        // Bildschirm hängen, sie „flögen“ dann verspätet ein.
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: ready ? 1 : 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <App />
        </motion.div>
      )}
      <AnimatePresence>{!ready && <SplashScreen />}</AnimatePresence>
      <Toaster />
    </QueryClientProvider>
  );
}

function App() {
  const onboarded = useAppStore((s) => s.onboarded);
  useEngine();
  useGoalAlerts();
  useUpdateCheck();
  useEffect(() => installPressFeedback(), []);
  // Nach einem Handywechsel kurz bestätigen (der Ladebildschirm kommt beim
  // Neuladen in derselben Sitzung nicht noch einmal).
  useEffect(() => {
    const t = window.setTimeout(
      () =>
        takeRestored() &&
        toast.success("Tipprunden übernommen", {
          description: "Teams, Zeiten und Einstellungen wählst du auf diesem Handy neu.",
        }),
      800,
    );
    return () => window.clearTimeout(t);
  }, []);
  useGlobalErrorLogging();
  useEffect(() => {
    sendPing();
    const id = window.setInterval(() => sendPing(), 10 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!onboarded)
    return (
      <Suspense fallback={null}>
        <OnboardingFlow />
      </Suspense>
    );
  return (
    <AppShell>
      <Outlet />
      <MatchSheet />
      <TeamSheet />
      <ChampionCelebration />
      <GroupNotice />
      <UnbanNotice />
    </AppShell>
  );
}

function useGlobalErrorLogging() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => logError("render", e.message || "Unbekannter Fehler");
    const onRej = (e: PromiseRejectionEvent) =>
      logError("system", e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
}
