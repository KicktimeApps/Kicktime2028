import { expect, test } from "@playwright/test";
import { seedState, setup } from "./helpers";

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

test("Vorschau-Modus: Korrekturen gesperrt, echte lassen sich entfernen", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/admin")) calls.push(r.postDataJSON()?.action ?? "");
  });
  const errors = await setup(page, {
    state: seedState({ demo: { enabled: true, scenario: "group", startedAt: Date.now() } }),
    mock: { admin: { verify: { ok: true }, clear_overrides: { ok: true, count: 1 } } },
  });
  await page.goto("/einstellungen");
  const version = page.getByText(/Version \d+\.\d+\.\d+/);
  for (let i = 0; i < 5; i++) await version.click();
  await page.getByLabel(/PIN/).first().fill("123456");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await page
    .getByRole("navigation", { name: "Admin-Bereiche" })
    .getByRole("button", { name: "Korrektur" })
    .click();
  await expect(page.getByText("Vorschau-Modus ist an.")).toBeVisible();
  await expect(page.getByPlaceholder(/Team, Datum oder/)).toHaveCount(0);
  await page.getByRole("button", { name: "Echte Korrekturen entfernen" }).click();
  await page.getByRole("button", { name: "Alle entfernen" }).click();
  await expect.poll(() => calls.includes("clear_overrides")).toBe(true);
  expect(errors).toEqual([]);
});
