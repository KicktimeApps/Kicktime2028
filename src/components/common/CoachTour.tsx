import { ArrowDown, ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Geführter Rundgang: dunkelt die Seite ab, hebt das gemeinte Element hervor
 * und zeigt mit einem Pfeil darauf. Ziele werden über `data-tour="…"`
 * gefunden; fehlt ein Ziel (z. B. ohne Server keine Tipprunden), entfällt
 * der Schritt einfach. Schritte ohne Ziel erscheinen mittig.
 */
export type TourStep = {
  /** Wert von `data-tour` am Ziel-Element. */
  target?: string;
  title: string;
  body: ReactNode;
};

const PAD = 6;
const GAP = 14;
const ARROW = 34;
const MARGIN = 16;

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  return el && el.getClientRects().length > 0 ? el : null;
}

export function CoachTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const reduce = useReducedMotion();
  // Nur Schritte, deren Ziel es gerade gibt (einmal beim Start bestimmt).
  const [available] = useState(() => steps.filter((s) => !s.target || findTarget(s.target)));
  const [index, setIndex] = useState(0);
  const step = available[index];
  const last = index === available.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);

  // Ziel in die Mitte holen und seine Lage laufend verfolgen (Scrollen, Drehen).
  useEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    let frame = 0;
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setView((v) => (v.w === vw && v.h === vh ? v : { w: vw, h: vh }));
      const h = card.current?.offsetHeight ?? 0;
      setCardH((prev) => (prev === h ? prev : h));
      const r = el?.getBoundingClientRect();
      setRect((prev) => {
        if (!r) return null;
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        return prev &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next;
      });
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!step) return null;
  const next = () => (last ? onClose() : setIndex((i) => i + 1));

  // Karte über oder unter dem Ziel – wo mehr Platz ist. Der Pfeil sitzt dazwischen.
  const cardW = Math.min(360, view.w - 2 * MARGIN);
  let cardTop = (view.h - cardH) / 2;
  let cardLeft = (view.w - cardW) / 2;
  let arrow: { top: number; left: number; up: boolean } | null = null;
  if (rect) {
    const cx = rect.left + rect.width / 2;
    const above = rect.top + rect.height / 2 > view.h / 2;
    cardLeft = Math.min(Math.max(cx - cardW / 2, MARGIN), view.w - cardW - MARGIN);
    if (above) {
      cardTop = rect.top - PAD - GAP - ARROW - cardH;
      arrow = { top: rect.top - PAD - GAP / 2 - ARROW, left: cx - ARROW / 2, up: false };
    } else {
      cardTop = rect.top + rect.height + PAD + GAP + ARROW;
      arrow = { top: rect.top + rect.height + PAD + GAP / 2, left: cx - ARROW / 2, up: true };
    }
    cardTop = Math.min(Math.max(cardTop, MARGIN), view.h - cardH - MARGIN);
  }

  // Direkt an <body>: Eltern mit Übergangsanimation (transform) würden „fixed“
  // sonst an die Seite statt an den Bildschirm binden.
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label={step.title}>
      {/* Abdunkeln – mit Aussparung um das Ziel */}
      {rect ? (
        <motion.div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary"
          initial={false}
          animate={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + 2 * PAD,
            height: rect.height + 2 * PAD,
          }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 36 }}
          style={{ boxShadow: "0 0 0 9999px rgb(3 7 18 / 0.72)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(3_7_18/0.72)]" />
      )}
      {/* Klicks neben die Karte landen nicht auf der Seite. */}
      <div className="absolute inset-0" />

      {arrow && (
        <motion.div
          key={`arrow-${index}`}
          className="pointer-events-none absolute flex items-center justify-center text-primary"
          style={{ top: arrow.top, left: arrow.left, width: ARROW, height: ARROW }}
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: arrow.up ? [0, -6, 0] : [0, 6, 0] }}
          transition={
            reduce
              ? { duration: 0.2 }
              : { y: { duration: 1, repeat: Infinity }, opacity: { duration: 0.2 } }
          }
        >
          {arrow.up ? (
            <ArrowUp className="h-8 w-8 drop-shadow-[0_0_8px_rgb(0_0_0/0.6)]" strokeWidth={3} />
          ) : (
            <ArrowDown className="h-8 w-8 drop-shadow-[0_0_8px_rgb(0_0_0/0.6)]" strokeWidth={3} />
          )}
        </motion.div>
      )}

      <motion.div
        key={index}
        ref={card}
        className="absolute rounded-2xl border border-border bg-card p-4 shadow-2xl"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="mb-2 flex items-center gap-1.5" aria-hidden>
          {available.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        <h2 className="text-[17px] font-bold leading-snug">{step.title}</h2>
        <div className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
          {step.body}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          {!last ? (
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-1 text-[14.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Überspringen
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={next}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground"
          >
            {last ? "Los geht’s" : index === 0 ? "Zeig mir’s" : "Weiter"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
