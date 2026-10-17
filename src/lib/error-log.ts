/**
 * Kleines In-Memory-Fehlerprotokoll (max. 50 Einträge) – sichtbar im
 * Admin-Bereich unter „System“. Bewusst nicht persistiert.
 */
export type ErrorCategory = "api" | "supabase" | "push" | "render" | "system";
export type ErrorEntry = { ts: number; category: ErrorCategory; message: string };

const entries: ErrorEntry[] = [];
const listeners = new Set<() => void>();

export function logError(category: ErrorCategory, message: string): void {
  entries.unshift({ ts: Date.now(), category, message: message.slice(0, 300) });
  entries.length = Math.min(entries.length, 50);
  for (const l of listeners) l();
  if (import.meta.env?.DEV) console.warn(`[${category}]`, message);
}

export function getErrors(): ErrorEntry[] {
  return [...entries];
}

export function clearErrors(): void {
  entries.length = 0;
  for (const l of listeners) l();
}

export function subscribeErrors(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
