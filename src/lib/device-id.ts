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
