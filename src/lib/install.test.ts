import { describe, expect, it } from "vitest";
import { detectInstallBrowser } from "./install";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iosFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15",
  iosGoogleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.790401573 Mobile/15E148 Safari/604.1",
  iosInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 389.0.0.38.95",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

describe("detectInstallBrowser", () => {
  it.each([
    [UA.iosSafari, 0, "ios-safari"],
    [UA.iosChrome, 0, "ios-chrome"],
    [UA.iosFirefox, 0, "ios-firefox"],
    [UA.iosGoogleApp, 0, "ios-other"],
    [UA.iosInstagram, 0, "in-app"],
    [UA.ipad, 5, "ios-safari"],
    [UA.ipad, 0, "desktop"],
    [UA.androidChrome, 0, "android-chrome"],
    [UA.androidSamsung, 0, "android-samsung"],
    [UA.androidFirefox, 0, "android-firefox"],
    [UA.androidEdge, 0, "android-edge"],
    [UA.androidWebView, 0, "android-other"],
    [UA.desktopChrome, 0, "desktop"],
  ])("%s (Touch %i) → %s", (ua, maxTouchPoints, expected) => {
    expect(detectInstallBrowser({ ua, maxTouchPoints })).toBe(expected);
  });
});
