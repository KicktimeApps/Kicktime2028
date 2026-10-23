import { expect, test } from "@playwright/test";
import { seedState, setup } from "./helpers";

// Vorschau „Nach dem Finale“ mit Spoilerschutz; Feier schon gesehen.
const state = seedState({
  spoilerProtection: true,
  demo: { enabled: true, scenario: "done", startedAt: Date.now() },
  celebratedChampion: "demo:TUR",
});

test("Tabellen aufdecken bleibt gemerkt – auch nach Seitenwechsel und Neuladen", async ({
  page,
}) => {
  const errors = await setup(page, { state });
  await page.goto("/turnier");
  const show = page.getByRole("button", { name: "Anzeigen" });
  await expect(show).toBeVisible();
  await show.click();
  await expect(show).toHaveCount(0);

  await page.getByRole("link", { name: "Spielplan" }).first().click();
  await page.getByRole("link", { name: "Turnier" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Turnier" })).toBeVisible();
  await expect(show).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Gruppe A")).toBeVisible();
  await expect(show).toHaveCount(0);
  expect(errors).toEqual([]);
});
