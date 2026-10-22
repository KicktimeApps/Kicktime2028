import { motion } from "framer-motion";
import { TOURNAMENT } from "@/tournament/config";

/** Längste Dauer der Öffnungsanimation (nur beim ersten Öffnen pro Sitzung). */
export const SPLASH_MS = 2400;
/** Kürzeste Dauer: bis Logo und Schriftzug fertig animiert sind. */
export const SPLASH_MIN_MS = 1100;

/**
 * Öffnungsanimation: pulsierende Aura, Logo, Schriftzug und Ladebalken.
 * Sie steckt schon im Server-HTML und läuft über reine CSS-Animationen
 * (`.splash-*` in styles.css) – so spielt sie, bevor JavaScript geladen ist.
 * Nur das Ausblenden übernimmt framer-motion.
 */
export function SplashScreen() {
  return (
    <motion.div
      key="splash"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background"
      aria-hidden
    >
      <div className="relative flex items-center justify-center">
        <div className="splash-aura absolute h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="splash-aura splash-aura-2 absolute h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <img
          src="/logo.svg"
          alt=""
          className="splash-logo relative h-32 w-32"
          style={{
            filter: "drop-shadow(0 0 24px color-mix(in oklab, var(--primary) 55%, transparent))",
          }}
        />
      </div>

      <div className="splash-text mt-10 flex flex-col items-center">
        <div className="font-display text-4xl font-bold uppercase tracking-[0.25em]">
          Kick<span className="text-primary">Time</span>
        </div>
        <div className="mt-2 text-sm tracking-[0.5em] text-muted-foreground">{TOURNAMENT.name}</div>
      </div>

      <div className="absolute bottom-20 left-1/2 h-px w-[60%] max-w-xs -translate-x-1/2 overflow-hidden rounded-full bg-primary/15">
        <div
          className="splash-bar h-full bg-primary"
          style={{
            animationDuration: `${SPLASH_MS}ms`,
            boxShadow: "0 0 8px color-mix(in oklab, var(--primary) 60%, transparent)",
          }}
        />
      </div>
    </motion.div>
  );
}
