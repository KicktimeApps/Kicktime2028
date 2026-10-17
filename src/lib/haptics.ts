/** Dezentes haptisches Feedback (Vibration API). Auf iOS ohne Wirkung. */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}

export const haptics = {
  tap: () => vibrate(8),
  success: () => vibrate([10, 30, 10]),
  warn: () => vibrate([20, 40, 20]),
};
