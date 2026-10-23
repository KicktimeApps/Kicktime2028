import { expect, test } from "@playwright/test";
import { expectNoSideScroll, setup } from "./helpers";

test("Einführung von Anfang bis Ende", async ({ page }) => {
  const errors = await setup(page, { state: null });
  await page.goto("/");
  await page.getByRole("button", { name: "In 1 Minute einrichten" }).click();
  // Schritte durchklicken (Anzahl hängt vom Gerät ab). Die Seiten blenden
  // animiert über – darum jeweils warten, bis es weitergehen kann.
  // „Weiter“ bzw. auf dem Handy „Ohne Installieren weiter“.
  const weiter = page.getByRole("button", { name: /weiter$/i });
  const done = page.getByRole("button", { name: "Los geht's" });
  const fav = page.getByRole("button", { name: "Deutschland als Favorit" });
  for (let i = 0; i < 10; i++) {
    await expect
      .poll(
        async () =>
          (await done.isVisible()) || (await weiter.isEnabled()) || (await fav.isVisible()),
      )
      .toBe(true);
    if (await done.isVisible()) {
      await done.click();
      break;
    }
    // Teams: „Weiter“ bleibt gesperrt, bis ein Favorit gewählt ist.
    if (!(await weiter.isEnabled())) await fav.click();
    await weiter.click();
  }
  await expect(page.getByRole("link", { name: "Spielplan" }).first()).toBeVisible();
  await expectNoSideScroll(page);
  expect(errors).toEqual([]);
});

for (const [path, heading] of [
  ["/", null],
  ["/spielplan", /Spielplan/i],
  ["/turnier", /Turnier/i],
  ["/tipps", /Tipps/i],
  ["/einstellungen", /Einstellungen/i],
] as const) {
  test(`Seite ${path} lädt ohne Fehler`, async ({ page }) => {
    const errors = await setup(page);
    await page.goto(path);
    if (heading) await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    else await expect(page.getByRole("main")).toBeVisible();
    await expectNoSideScroll(page);
    expect(errors).toEqual([]);
  });
}
