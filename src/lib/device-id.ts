/**
 * Anonyme, stabile Geräte-ID (UUID in localStorage). Ersetzt ein Nutzerkonto
 * für Push-Abos und Telemetrie – enthält keine personenbezogenen Daten.
 */
const KEY = "kicktime-2028.device";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Ersatz, falls localStorage gesperrt ist – sonst gäbe es bei jedem Aufruf
// eine neue ID und Abo und Erinnerungen passten nicht mehr zusammen.
let memoryId: string | null = null;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = memoryId ?? uuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memoryId ??= uuid();
    return memoryId;
  }
}

/* ---------------------------------------------------- Handywechsel */

/**
 * Wiederherstellungs-Code = die Geräte-ID selbst, gut lesbar: 32 Zeichen
 * (0–9, A–F) in 8 Vierergruppen. Wer ihn kennt, ist für den Server dieses
 * Gerät – darum geheim halten.
 */
export function formatRecoveryCode(id: string): string {
  const hex = id.replace(/-/g, "").toUpperCase();
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

/** Eingabe → Geräte-ID (Kleinbuchstaben mit Bindestrichen) oder null, wenn unvollständig. */
export function parseRecoveryCode(input: string): string | null {
  const hex = input.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const RESTORED_KEY = "kicktime-2028.restored";

/** Geräte-ID eines anderen Geräts übernehmen (danach die App neu laden). */
export function adoptDeviceId(id: string): void {
  memoryId = id;
  try {
    localStorage.setItem(KEY, id);
    sessionStorage.setItem(RESTORED_KEY, "1");
  } catch {
    /* nur im Speicher – gilt bis zum Schließen */
  }
}

/** Nach dem Neuladen: Wurde gerade ein Code übernommen? (nur einmal true) */
export function takeRestored(): boolean {
  try {
    if (!sessionStorage.getItem(RESTORED_KEY)) return false;
    sessionStorage.removeItem(RESTORED_KEY);
    return true;
  } catch {
    return false;
  }
}
