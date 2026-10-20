import { describe, expect, it } from "vitest";
import { visibleAnnouncement, type Announcement } from "@/services/announcement";
import { isLikelyBot } from "./telemetry";

describe("isLikelyBot", () => {
  it.each([
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", false, true],
    ["facebookexternalhit/1.1", false, true],
    ["WhatsApp/2.23.20.0", false, true],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0", false, true],
    ["python-requests/2.31", false, true],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      false,
      false,
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      true,
      true,
    ],
  ])("%s (webdriver %s) → %s", (ua, webdriver, bot) => {
    expect(isLikelyBot(ua, webdriver)).toBe(bot);
  });
});

describe("visibleAnnouncement", () => {
  const a: Announcement = { id: 1, text: "Hallo", tone: "info", until: null };
  const now = Date.parse("2027-01-01T12:00:00Z");
  it("zeigt aktiven Hinweis", () => expect(visibleAnnouncement(a, null, now)).toBe(a));
  it("weggeklickt bleibt weg", () => expect(visibleAnnouncement(a, 1, now)).toBeNull());
  it("neuer Hinweis erscheint trotz altem Wegklicken", () =>
    expect(visibleAnnouncement({ ...a, id: 2 }, 1, now)).not.toBeNull());
  it("abgelaufen", () =>
    expect(visibleAnnouncement({ ...a, until: "2026-12-31T00:00:00Z" }, null, now)).toBeNull());
});
