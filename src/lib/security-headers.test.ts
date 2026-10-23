import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers";

describe("Schutz-Header", () => {
  it("ergänzt alle Header und lässt Inhalt und Status unverändert", async () => {
    const res = withSecurityHeaders(
      new Response("<p>hi</p>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("<p>hi</p>");
    expect(res.headers.get("content-type")).toBe("text/html");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("überschreibt keine vorhandenen Header", () => {
    const res = withSecurityHeaders(
      new Response(null, { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
