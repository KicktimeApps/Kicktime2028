/**
 * Druck-Rückmeldung wie in nativen iOS-Apps: Knöpfe, Links und Reiter werden
 * beim Antippen kurz blasser und blenden beim Loslassen weich zurück – kein
 * Einsinken.
 *
 * - Auf Touch erst nach kurzer Verzögerung: Wer scrollt, löst nichts aus
 *   (Bewegung > 10 px oder Scrollen des Browsers bricht ab).
 * - Sehr kurze Tipper blinken trotzdem einmal auf, damit man merkt, dass er
 *   angekommen ist.
 * - Läuft über die Web Animations API und ist damit unabhängig von den
 *   transition-Klassen der einzelnen Elemente.
 * Ausnahmen: Element (oder Vorfahre) mit `data-no-press`.
 */
const SELECTOR =
  'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"]), [role="tab"], [role="switch"]';
const TOUCH_DELAY_MS = 70;
const MOVE_TOLERANCE_PX = 10;
const DIM = 0.55;
const IN_MS = 90;
const OUT_MS = 250;

export function installPressFeedback(): () => void {
  if (typeof window === "undefined" || typeof Element.prototype.animate !== "function") {
    return () => {};
  }
  let el: HTMLElement | null = null;
  let base = 1;
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let shown = false;
  let anim: Animation | null = null;

  const fade = (target: HTMLElement, from: number, to: number, ms: number, keep: boolean) => {
    const next = target.animate([{ opacity: from }, { opacity: to }], {
      duration: ms,
      easing: "ease-out",
      fill: keep ? "forwards" : "none",
    });
    anim?.cancel();
    anim = keep ? next : null;
    if (!keep) next.onfinish = () => next.cancel();
  };

  const show = () => {
    if (!el) return;
    shown = true;
    fade(el, base, base * DIM, IN_MS, true);
  };

  const release = (flash: boolean) => {
    window.clearTimeout(timer);
    const target = el;
    el = null;
    if (!target) return;
    // Gezeigt → zurückblenden; sehr kurzer Tipper (noch nicht gezeigt) → einmal aufblinken.
    if (shown || flash) fade(target, base * DIM, base, OUT_MS, false);
    shown = false;
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0) return;
    const hit = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
    if (!hit || hit.closest("[data-no-press]")) return;
    release(false);
    el = hit;
    base = Number.parseFloat(getComputedStyle(hit).opacity) || 1;
    startX = e.clientX;
    startY = e.clientY;
    shown = false;
    if (e.pointerType === "mouse") show();
    else timer = window.setTimeout(show, TOUCH_DELAY_MS);
  };
  const onMove = (e: PointerEvent) => {
    if (!el || !e.isPrimary) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) release(false);
  };
  const onUp = () => release(true);
  const onCancel = () => release(false);

  const opts = { capture: true, passive: true } as const;
  document.addEventListener("pointerdown", onDown, opts);
  document.addEventListener("pointermove", onMove, opts);
  document.addEventListener("pointerup", onUp, opts);
  document.addEventListener("pointercancel", onCancel, opts);
  window.addEventListener("scroll", onCancel, opts);
  window.addEventListener("blur", onCancel);
  return () => {
    release(false);
    document.removeEventListener("pointerdown", onDown, opts);
    document.removeEventListener("pointermove", onMove, opts);
    document.removeEventListener("pointerup", onUp, opts);
    document.removeEventListener("pointercancel", onCancel, opts);
    window.removeEventListener("scroll", onCancel, opts);
    window.removeEventListener("blur", onCancel);
  };
}
