import { expect, test } from "@playwright/test";
import { setup } from "./helpers";

const deviceId = (page: import("@playwright/test").Page) =>
  page.evaluate(() => localStorage.getItem("kicktime-2028.device"));

async function deleteAll(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Alle Daten löschen" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Aus deinen Tipprunden trittst du aus");
  await page.getByRole("button", { name: "Ja, löschen" }).click();
}

test("Alle Daten löschen: erst auf dem Server austreten, dann lokal löschen", async ({ page }) => {
  const forgotten: unknown[] = [];
  const errors = await setup(page, {
    mock: {
      rpc: {
        kt_forget_device: (body: Record<string, unknown>) => {
          forgotten.push(body.p_device);
          return { left: 2 };
        },
      },
    },
  });
  await page.goto("/einstellungen");
  await expect.poll(() => deviceId(page)).not.toBeNull();
  const before = await deviceId(page);

  await deleteAll(page);
  await page.waitForURL((u) => u.pathname === "/");
  expect(forgotten).toEqual([before]);
  // Neue App-Daten, neue Geräte-ID – die alte ist weg.
  await expect.poll(() => deviceId(page)).not.toBe(before);
  expect(errors).toEqual([]);
});

test("Alle Daten löschen ohne Verbindung: nichts wird gelöscht", async ({ page }) => {
  await setup(page);
  await page.route(/\/rpc\/kt_forget_device/, (route) => route.abort());
  await page.goto("/einstellungen");
  await expect.poll(() => deviceId(page)).not.toBeNull();
  const before = await deviceId(page);

  await deleteAll(page);
  await expect(page.getByText("Ohne Verbindung zum KickTime-Server")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/einstellungen");
  expect(await deviceId(page)).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("kicktime-2028"))).not.toBeNull();
});
