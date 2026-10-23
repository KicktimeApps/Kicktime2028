import { expect, test } from "@playwright/test";
import { setup } from "./helpers";

test("KickTime-Team-Bereich: PIN, Live-Daten, Wächter", async ({ page }) => {
  const errors = await setup(page, {
    state: undefined,
    mock: {
      admin: {
        verify: { ok: true },
        alerts: { alerts: [] },
        config: {
          liveSource: { league: "em", season: "2028", suffix: "", paused: false },
          defaults: { league: "em", season: "2028" },
          cache: [],
          storedResults: 0,
        },
        team_device: {
          ok: true,
          registered: true,
          count: 1,
          reachable: 1,
          selfPush: true,
          devices: [
            {
              self: true,
              push: true,
              lastOk: new Date().toISOString(),
              lastFail: null,
              lastStatus: null,
            },
          ],
        },
      },
    },
  });
  await page.goto("/einstellungen");
  const version = page.getByText(/Version \d+\.\d+\.\d+/);
  for (let i = 0; i < 5; i++) await version.click();
  await page.getByLabel(/PIN/).first().fill("123456");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await page
    .getByRole("navigation", { name: "Admin-Bereiche" })
    .getByRole("button", { name: "Live-Daten" })
    .click();
  await expect(page.getByText("Wächter")).toBeVisible();
  await expect(page.getByText(/zuletzt zugestellt/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Test-Mitteilung schicken" })).toBeVisible();
  expect(errors).toEqual([]);
});
