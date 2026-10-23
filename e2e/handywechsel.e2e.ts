import { expect, test } from "@playwright/test";
import { GROUP, setup } from "./helpers";

const OLD = "3f2a91c0-7b4e-4d21-9a8c-0e5f6b7c8d9e";

test("Handywechsel: Code prüfen und übernehmen", async ({ page }) => {
  const errors = await setup(page, {
    mock: {
      rpc: {
        kt_tip_my_groups: (body: Record<string, unknown>) => (body.p_device === OLD ? [GROUP] : []),
      },
    },
  });
  await page.goto("/einstellungen?s=handywechsel");
  const box = page.getByRole("textbox", { name: "Wiederherstellungs-Code" });
  const check = page.getByRole("button", { name: "Code prüfen" });

  await box.fill("3F2A 91C0");
  await expect(check).toBeDisabled();

  await box.fill("1111 2222 3333 4444 5555 6666 7777 8888");
  await check.click();
  await expect(page.getByRole("alert")).toContainText("keine Tipprunden");

  await box.fill("3F2A 91C0 7B4E 4D21 9A8C 0E5F 6B7C 8D9E");
  await check.click();
  await expect(page.getByText("Gefunden: 1 Tipprunde")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();

  await page.waitForURL("**/tipps");
  await expect(page.getByText("Tipprunden übernommen")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kicktime-2028.device"))).toBe(OLD);
  expect(errors).toEqual([]);
});
