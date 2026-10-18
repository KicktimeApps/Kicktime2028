/**
 * Kleines In-Memory-Fehlerprotokoll (max. 50 Einträge) – sichtbar im
 * Admin-Bereich unter „System“. Bewusst nicht persistiert.
 */
export type ErrorCategory = "api" | "supabase" | "push" | "render" | "system";
export type ErrorEntry = { ts: number; category: ErrorCategory; message: string };

// Unveränderlicher Schnappschuss: wird nur bei Änderungen neu erzeugt. Sonst
// liefert getErrors bei jedem Aufruf ein neues Array, und useSyncExternalStore
// rendert endlos neu (Absturz des Admin-Bereichs).
let entries: readonly ErrorEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function logError(category: ErrorCategory, message: string): void {
  entries = [{ ts: Date.now(), category, message: message.slice(0, 300) }, ...entries].slice(0, 50);
  emit();
  if (import.meta.env?.DEV) console.warn(`[${category}]`, message);
}

export function getErrors(): readonly ErrorEntry[] {
  return entries;
}

export function clearErrors(): void {
  entries = [];
  emit();
}

export function subscribeErrors(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
