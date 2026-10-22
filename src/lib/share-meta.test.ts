import { describe, expect, it } from "vitest";
import { injectShareMeta, shareImagePath } from "./share-meta";

const page = (head: string) => `<!DOCTYPE html><html><head>${head}</head><body>x</body></html>`;

describe("injectShareMeta", () => {
  it("setzt Bild und Adresse absolut – aus der aufgerufenen URL", () => {
    const out = injectShareMeta(
      page('<meta property="og:title" content="KickTime"/>'),
      new URL("https://em28.kicktime.app/spielplan?x=1"),
    );
    expect(out).toContain(
      '<meta property="og:image" content="https://em28.kicktime.app/og-app.png"/>',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://em28.kicktime.app/spielplan"/>',
    );
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    expect(out.indexOf("og:image")).toBeLessThan(out.indexOf("</head>"));
  });

  it("Einladungslink: eigenes Bild, Titel der Unterseite gewinnt", () => {
    const out = injectShareMeta(
      page(
        '<meta property="og:title" content="KickTime 2028"/>' +
          '<meta name="twitter:card" content="summary"/>' +
          '<meta property="og:image" content="/icon-512.png"/>' +
          '<meta property="og:title" content="Du bist zur Tipprunde eingeladen"/>',
      ),
      new URL("https://x.workers.dev/runde/ABC123"),
      "https://em28.kicktime.app/",
    );
    expect(out.match(/og:title/g)).toHaveLength(1);
    expect(out).toContain('content="Du bist zur Tipprunde eingeladen"');
    expect(out.match(/og:image"/g)).toHaveLength(1);
    expect(out).toContain('content="https://em28.kicktime.app/og-invite.png"');
    expect(out.match(/twitter:card/g)).toHaveLength(1);
  });

  it("ohne </head> unverändert", () => {
    expect(injectShareMeta("{}", new URL("https://a.b/"))).toBe("{}");
  });

  it("Bildwahl nach Pfad", () => {
    expect(shareImagePath("/runde/ABC123")).toBe("/og-invite.png");
    expect(shareImagePath("/runde/ABC123/")).toBe("/og-invite.png");
    expect(shareImagePath("/runde")).toBe("/og-app.png");
    expect(shareImagePath("/")).toBe("/og-app.png");
  });
});
