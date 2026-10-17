import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LogoMark } from "@/components/layout/Logo";
import { MatchSheet } from "@/components/match/MatchSheet";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { TeamSheet } from "@/components/team/TeamSheet";
import { ChampionCelebration } from "@/components/tournament/ChampionCelebration";
import { Toaster } from "@/components/ui/sonner";
import { useEngine } from "@/hooks/useEngine";
import { logError } from "@/lib/error-log";
import { sendPing } from "@/lib/telemetry";
import { useAppStore } from "@/store/app-store";
import { useMatchStore } from "@/store/match-store";
import { SITE_URL, TOURNAMENT } from "@/tournament/config";

import appCss from "../styles.css?url";

const TITLE = `KickTime ${TOURNAMENT.year} – Dein persönlicher EM-Planer`;
const DESCRIPTION =
  "Wähle deine Teams und deine freien Zeiten – KickTime zeigt dir, welche Spiele der EURO 2028 in deinen Alltag passen. Spoilerfrei, mit Live-Tabellen, K.-o.-Baum und Tipps.";

/**
 * Setzt Dark/Light-Klasse vor dem ersten Paint (kein Aufblitzen).
 * Liest die gespeicherte Einstellung direkt aus localStorage.
 */
const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("${TOURNAMENT.storagePrefix}")||"{}").state||{};var t=s.theme||"system";if(t==="system"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t)}catch(e){}})();`;

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

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => logError("render", error.message), [error]);
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
      { name: "theme-color", content: "#0b1122" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "KickTime" },
      { property: "og:site_name", content: `KickTime ${TOURNAMENT.year}` },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      ...(SITE_URL ? [{ property: "og:image", content: `${SITE_URL}/icon-512.png` }] : []),
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
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

function BootScreen() {
  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center">
      <LogoMark className="h-14 w-14 animate-pulse" />
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrated = useHydrated();
  return (
    <QueryClientProvider client={queryClient}>
      {hydrated ? <App /> : <BootScreen />}
      <Toaster />
    </QueryClientProvider>
  );
}

function App() {
  const onboarded = useAppStore((s) => s.onboarded);
  useEngine();
  useGlobalErrorLogging();
  useEffect(() => {
    sendPing();
    const id = window.setInterval(() => sendPing(), 10 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!onboarded) return <OnboardingFlow />;
  return (
    <AppShell>
      <Outlet />
      <MatchSheet />
      <TeamSheet />
      <ChampionCelebration />
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
