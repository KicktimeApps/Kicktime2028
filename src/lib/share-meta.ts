/**
 * Link-Vorschau (WhatsApp, Signal, iMessage …): Diese Dienste lesen nur das
 * Server-HTML und brauchen für das Bild eine vollständige Adresse. Die kennt
 * erst der Server beim Ausliefern – darum ergänzt `src/server.ts` jede HTML-Seite
 * hiermit (Adresse aus SITE_URL oder sonst aus der aufgerufenen URL).
 */

export const SHARE_IMAGE_APP = "/og-app.png";
export const SHARE_IMAGE_INVITE = "/og-invite.png";

const INVITE_PATH = /^\/runde\/[^/]+\/?$/;

/** Einladungslinks bekommen ihr eigenes Bild, alles andere das App-Bild. */
export function shareImagePath(pathname: string): string {
  return INVITE_PATH.test(pathname) ? SHARE_IMAGE_INVITE : SHARE_IMAGE_APP;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const metaTag = (attr: "property" | "name", key: string) =>
  new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, "\\$&")}"[^>]*>`, "g");

/** Doppelte Angaben (Grundeinstellung + Unterseite): nur die letzte behalten. */
function keepLast(html: string, attr: "property" | "name", key: string): string {
  const re = metaTag(attr, key);
  const count = html.match(re)?.length ?? 0;
  if (count < 2) return html;
  let seen = 0;
  return html.replace(re, (m) => (++seen < count ? "" : m));
}

export function injectShareMeta(html: string, pageUrl: URL, siteUrl = ""): string {
  const head = html.indexOf("</head>");
  if (head < 0) return html;
  const origin = (siteUrl || pageUrl.origin).replace(/\/$/, "");
  const image = origin + shareImagePath(pageUrl.pathname);

  let out = html;
  for (const key of ["og:title", "og:description"]) out = keepLast(out, "property", key);
  out = keepLast(out, "name", "description");
  // Bild, Adresse und Kartentyp setzt ausschließlich der Server.
  for (const key of ["og:image", "og:image:width", "og:image:height", "og:image:alt", "og:url"])
    out = out.replace(metaTag("property", key), "");
  for (const key of ["twitter:card", "twitter:image"]) out = out.replace(metaTag("name", key), "");

  const tags = [
    `<meta property="og:url" content="${escapeAttr(origin + pageUrl.pathname)}"/>`,
    `<meta property="og:image" content="${escapeAttr(image)}"/>`,
    `<meta property="og:image:width" content="1200"/>`,
    `<meta property="og:image:height" content="630"/>`,
    `<meta property="og:image:alt" content="KickTime 2028"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:image" content="${escapeAttr(image)}"/>`,
  ].join("");
  const at = out.indexOf("</head>");
  return out.slice(0, at) + tags + out.slice(at);
}
