import { AnimatePresence, motion } from "framer-motion";
import { Trophy, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Flag } from "@/components/team/Flag";
import { tournamentWinner } from "@/domain/status";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";

const COLORS = ["#F5C542", "#3EE58C", "#F5F7FB", "#5AA9FF", "#FF6B6B"];

/** Einmalige Feier, sobald der Europameister feststeht (nicht im Demo-Modus gespeichert). */
export function ChampionCelebration() {
  const tournament = useTournament();
  const champion = tournamentWinner(tournament);
  const celebrated = useAppStore((s) => s.celebratedChampion);
  const demo = useAppStore((s) => s.demo.enabled);
  const setCelebrated = useAppStore((s) => s.setCelebrated);
  // Spoilerschutz: erst feiern, wenn das Finale-Ergebnis aufgedeckt wurde.
  const finalId = tournament.matches.find((m) => m.stage === "final")?.id ?? "";
  const visible = useAppStore((s) => !s.spoilerProtection || !!s.revealed[finalId]);
  const key = demo ? `demo:${champion}` : champion;
  const open = !!champion && visible && celebrated !== key;
  const nation = getNation(champion);
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 10) * 0.25,
        duration: 3.5 + ((i * 7) % 10) / 4,
        color: COLORS[i % COLORS.length],
        rotate: (i * 47) % 360,
      })),
    [],
  );
  const close = () => key && setCelebrated(key);
  const shown = open && !!nation;

  // Seite dahinter sperren: kein Scrollen, Escape schließt.
  useEffect(() => {
    if (!shown) return;
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      [html.style.overflow, document.body.style.overflow] = prev;
      window.removeEventListener("keydown", onKey);
    };
    // close ändert sich mit jedem Rendern, hängt aber nur an key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, key]);

  if (typeof document === "undefined") return null;
  // Direkt an <body>: Eltern mit Animation/transform würden „fixed“ sonst auf
  // ihren Bereich beschränken – auf dem iPhone stand die Feier dann irgendwo
  // weiter unten auf der Seite statt mittig auf dem Bildschirm.
  return createPortal(
    <AnimatePresence>
      {open && nation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex touch-none items-center justify-center overscroll-none bg-black/75 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${nation.name} ist Europameister`}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {pieces.map((p, i) => (
              <motion.span
                key={i}
                initial={{ y: -30, opacity: 0, rotate: 0 }}
                animate={{ y: "105vh", opacity: [0, 1, 1, 0.8], rotate: p.rotate + 360 }}
                transition={{ duration: p.duration, delay: p.delay, ease: "easeIn", repeat: 1 }}
                style={{ left: `${p.left}%`, background: p.color }}
                className="absolute top-0 h-2.5 w-1.5 rounded-sm"
              />
            ))}
          </div>
          <motion.div
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/40 bg-card p-8 text-center"
          >
            <div className="gold-shimmer pointer-events-none absolute inset-0" aria-hidden />
            <button
              type="button"
              onClick={close}
              aria-label="Schließen"
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto h-16 w-16 fill-gold/25 text-gold" />
            <Flag flag={nation.flag} size="xl" className="mx-auto mt-5" />
            <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-gold">
              Europameister {TOURNAMENT.year}
            </div>
            <div className="mt-1 font-display text-4xl font-bold uppercase">{nation.name}</div>
            <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
              Was für ein Turnier! Danke, dass du die {TOURNAMENT.name} mit KickTime geplant hast.
            </p>
            <button
              type="button"
              onClick={close}
              className="relative mt-6 h-12 w-full rounded-full bg-gold font-semibold text-gold-foreground"
            >
              Feiern 🎉
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
