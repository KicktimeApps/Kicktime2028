import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DemoBanner } from "./DemoBanner";
import { LogoMark, Wordmark } from "./Logo";
import { NAV_ITEMS } from "./nav";
import { SpoilerToggle } from "./SpoilerToggle";
import { useAppStore } from "@/store/app-store";
import { TOURNAMENT } from "@/tournament/config";

function useActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string) => (to === "/" ? path === "/" : path.startsWith(to));
}

export function AppShell({ children }: { children: ReactNode }) {
  const isActive = useActive();
  const demo = useAppStore((s) => s.demo.enabled);
  return (
    <div className={cn("app-shell app-backdrop flex min-h-dvh w-full", demo && "has-demo-banner")}>
      {/* Desktop-Seitenleiste */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-subtle/60 px-4 py-6 backdrop-blur md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <LogoMark className="h-9 w-9" />
          <Wordmark />
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                isActive(to)
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <SpoilerToggle withLabel className="w-full justify-start" />
        <p className="mt-4 px-2 text-[11px] leading-relaxed text-muted-foreground">
          {TOURNAMENT.longName}
          <br />
          {TOURNAMENT.hosts}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kopfbereich: Auf dem iPhone (Home-Bildschirm-App) liegt die Statusleiste
            über der Seite – deshalb Abstand nach oben und ein deckender Hintergrund,
            damit nichts verschwommen darunter durchscheint. */}
        <div className="safe-top sticky top-0 z-30 bg-background">
          <header className="flex h-14 items-center justify-between border-b border-border/70 px-4 md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <LogoMark className="h-7 w-7" />
              <Wordmark className="text-[20px]" />
            </Link>
            <SpoilerToggle />
          </header>
          <DemoBanner />
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>

        {/* Mobile-Navigation */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background md:hidden">
          <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const active = isActive(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                        active && "bg-primary/14",
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
