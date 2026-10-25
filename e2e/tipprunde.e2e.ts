import { expect, test } from "@playwright/test";
import { expectNoSideScroll, GROUP, seedState, setup } from "./helpers";

// Vorschau „Gruppenphase live“: Ergebnisse simuliert, ein Spieltag läuft gerade.
const state = seedState({ demo: { enabled: true, scenario: "group", startedAt: Date.now() } });

const tips = (seed: number) =>
  Object.fromEntries(
    Array.from({ length: 51 }, (_, i) => [
      `m${String(i + 1).padStart(2, "0")}`,
      { home: (i + seed) % 3, away: (i * seed) % 2 },
    ]),
  );
const board = {
  group: { id: GROUP.id, code: GROUP.code, name: GROUP.name, isOwner: true },
  members: [
    { id: "a", name: "Ben", isOwner: true, isMe: true, champion: null, tips: tips(1) },
    { id: "b", name: "Lena", isOwner: false, isMe: false, champion: null, tips: tips(2) },
    { id: "c", name: "Tim", isOwner: false, isMe: false, champion: null, tips: tips(3) },
  ],
  requests: [],
};
const mock = { rpc: { kt_tip_my_groups: [GROUP], kt_tip_board: board } };

test("Tipprunde: Tippen, Vergleich und Tabelle mit Live-Punkten", async ({ page }) => {
  const errors = await setup(page, { state, mock });
  await page.goto(`/runde/${GROUP.code}`);
  await expect(page.getByRole("heading", { level: 1, name: GROUP.name })).toBeVisible();

  await page.getByRole("tab", { name: "Vergleich" }).click();
  await expect(page.getByText("Ben").first()).toBeVisible();
  await expect(page.getByTitle("Punkte im Spieltag")).toBeVisible();

  await page.getByRole("tab", { name: "Tabelle" }).click();
  await expect(page.getByText("Lena")).toBeVisible();
  await expect(page.getByText(/Punkte aus laufenden Spielen sind vorläufig/)).toBeVisible();
  await expect(page.getByText(/live$/).first()).toBeVisible();

  await page.getByRole("tab", { name: "Tippen" }).click();
  await expectNoSideScroll(page);
  expect(errors).toEqual([]);
});

test("Rundenliste zeigt den Hinweis „Code sichern“", async ({ page }) => {
  const errors = await setup(page, { state: seedState({ codeBackupDone: false }), mock });
  await page.goto("/tipps");
  await expect(page.getByText("Sichere deinen Code")).toBeVisible();
  await page.getByRole("link", { name: "Code sichern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Handy wechseln" })).toBeVisible();
  await page.getByRole("button", { name: "Code anzeigen" }).click();
  await expect(page.getByRole("button", { name: "Kopieren" })).toBeVisible();
  await page.goto("/tipps");
  await expect(page.getByText(GROUP.name)).toBeVisible();
  await expect(page.getByText("Sichere deinen Code")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Kurz vor dem Turnier: Erinnerung „Code gesichert?“ für alle, die ihn nur weggeklickt haben", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2028-06-01T10:00:00Z"));
  const errors = await setup(page, { state: seedState({ codeBackupDone: true }), mock });
  await page.goto("/tipps");
  await expect(page.getByText("Bald geht's los – Code gesichert?")).toBeVisible();
  await page.getByRole("button", { name: "Hinweis schließen" }).click();
  await expect(page.getByText("Bald geht's los – Code gesichert?")).toHaveCount(0);
  await page.goto("/tipps");
  await expect(page.getByText(GROUP.name)).toBeVisible();
  await expect(page.getByText("Bald geht's los – Code gesichert?")).toHaveCount(0);
  expect(errors).toEqual([]);
});
