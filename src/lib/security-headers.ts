/**
 * Schutz-Header für alle Antworten des Workers:
 * - keine Einbettung in fremde Seiten (Klick-Täuschung),
 * - der Browser rät keine Dateitypen,
 * - fremde Seiten erfahren beim Klick auf einen Link nur die Domain,
 * - Kamera, Mikrofon, Standort usw. sind gesperrt (nutzt die App nicht),
 * - nur verschlüsselt (HTTPS) erreichbar.
 * Bewusst ohne vollständige Content-Security-Policy: Die Startskripte stehen
 * inline im HTML; eine strenge Regel würde die App bei jeder Änderung brechen.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
};

/** Ergänzt fehlende Schutz-Header; vorhandene bleiben unverändert. */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
      changed = true;
    }
  }
  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
