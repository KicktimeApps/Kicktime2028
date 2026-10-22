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
 *
 * Übergänge ohne Ruckeln: Ist das nächste Ziel schon gut sichtbar, gleitet
 * die Hervorhebung dorthin. Muss die Seite scrollen, blenden Hervorhebung und
 * Karte kurz aus, die Seite scrollt in Ruhe, dann erscheint alles an der
 * fertigen Stelle. Scrollt man selbst, bleibt alles fest am Element.
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
/** So weit muss ein Ziel vom oberen/unteren Rand weg sein, um ohne Scrollen zu gelten. */
const COMFORT = 96;
const GLIDE_MS = 320;
const FADE_MS = 180;

type Rect = { top: number; left: number; width: number; height: number };
/** glide: Hervorhebung gleitet · settle: Seite scrollt, alles ausgeblendet · shown: steht */
type Phase = "glide" | "settle" | "shown";

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  return el && el.getClientRects().length > 0 ? el : null;
}

const toRect = (r: DOMRect): Rect => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
});
const same = (a: Rect | null, b: Rect | null) =>
  !!a &&
  !!b &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

export function CoachTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const reduce = useReducedMotion();
  // Nur Schritte, deren Ziel es gerade gibt (einmal beim Start bestimmt).
  const [available] = useState(() => steps.filter((s) => !s.target || findTarget(s.target)));
  const [index, setIndex] = useState(0);
  const step = available[index];
  const last = index === available.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [phase, setPhase] = useState<Phase>("shown");
  const [view, setView] = useState({ w: 0, h: 0 });
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);

  useEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    const vh = window.innerHeight;
    let frame = 0;
    let timer = 0;
    let lastRect: Rect | null = null;
    let stableFrames = 0;
    let settling = false;
    /** Zeitpunkt, an dem das Scrollen angestoßen wurde (0 = noch nicht). */
    let scrollAt = 0;

    // Lage laufend verfolgen (auch wenn man selbst scrollt oder das Handy dreht).
    const measure = () => {
      const vw = window.innerWidth;
      setView((v) =>
        v.w === vw && v.h === window.innerHeight ? v : { w: vw, h: window.innerHeight },
      );
      const h = card.current?.offsetHeight ?? 0;
      setCardH((prev) => (prev === h ? prev : h));
      const next = el ? toRect(el.getBoundingClientRect()) : null;
      if (settling) {
        // Warten, bis das Scrollen zur Ruhe gekommen ist (oder nach spätestens 1,2 s).
        stableFrames = same(lastRect, next) ? stableFrames + 1 : 0;
        lastRect = next;
        const since = scrollAt ? performance.now() - scrollAt : 0;
        if (scrollAt && ((since > 150 && stableFrames >= 6) || since > 1200)) {
          settling = false;
          setRect(next);
          setPhase("shown");
        }
      } else {
        setRect((prev) => (same(prev, next) ? prev : next));
      }
      frame = requestAnimationFrame(measure);
    };

    if (!el) {
      setPhase("shown");
      setRect(null);
    } else {
      const r = el.getBoundingClientRect();
      const comfortable = r.top >= COMFORT && r.bottom <= vh - COMFORT;
      if (comfortable || reduce) {
        setPhase(reduce ? "shown" : "glide");
        if (!comfortable) el.scrollIntoView({ block: "center" });
        timer = window.setTimeout(() => setPhase("shown"), GLIDE_MS);
      } else {
        settling = true;
        setPhase("settle");
        // Erst ausblenden lassen, dann scrollen – sonst sieht man das Springen.
        timer = window.setTimeout(() => {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          scrollAt = performance.now();
        }, FADE_MS);
      }
    }
    measure();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
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

  const hidden = phase === "settle";
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  // Gleiten nur beim Schrittwechsel; sonst folgt alles direkt dem Element.
  const move =
    phase === "glide"
      ? ["top", "left", "width", "height"].map((p) => `${p} ${GLIDE_MS}ms ${ease}`).join(", ")
      : "";
  const fade = `opacity ${FADE_MS}ms ease-out`;

  // Direkt an <body>: Eltern mit Übergangsanimation (transform) würden „fixed“
  // sonst an die Seite statt an den Bildschirm binden.
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label={step.title}>
      {/* Ganz abgedunkelt: ohne Ziel und während die Seite scrollt */}
      <div
        className="absolute inset-0 bg-[rgb(3_7_18/0.72)]"
        style={{ opacity: rect && !hidden ? 0 : 1, transition: fade }}
      />
      {/* Abdunkeln mit Aussparung um das Ziel */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + 2 * PAD,
            height: rect.height + 2 * PAD,
            boxShadow: "0 0 0 9999px rgb(3 7 18 / 0.72)",
            opacity: hidden ? 0 : 1,
            transition: [move, fade].filter(Boolean).join(", "),
          }}
        />
      )}
      {/* Klicks neben die Karte landen nicht auf der Seite. */}
      <div className="absolute inset-0" />

      {arrow && (
        <div
          className="pointer-events-none absolute flex items-center justify-center text-primary"
          style={{
            top: arrow.top,
            left: arrow.left,
            width: ARROW,
            height: ARROW,
            opacity: phase === "shown" ? 1 : 0,
            transition: fade,
          }}
        >
          <motion.div
            animate={reduce ? undefined : { y: arrow.up ? [0, -6, 0] : [0, 6, 0] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          >
            {arrow.up ? (
              <ArrowUp className="h-8 w-8 drop-shadow-[0_0_8px_rgb(0_0_0/0.6)]" strokeWidth={3} />
            ) : (
              <ArrowDown className="h-8 w-8 drop-shadow-[0_0_8px_rgb(0_0_0/0.6)]" strokeWidth={3} />
            )}
          </motion.div>
        </div>
      )}

      <div
        ref={card}
        className="absolute rounded-2xl border border-border bg-card p-4 shadow-2xl"
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardW,
          opacity: phase === "shown" ? 1 : 0,
          transform: phase === "shown" || reduce ? "none" : "translateY(6px)",
          transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
        }}
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
      </div>
    </div>,
    document.body,
  );
}
