import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function bootSession(page: import("playwright").Page): Promise<void> {
  await page.getByTestId("new-session").click();
  await page.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
  const confirm = page.getByLabel(/Confirm|Potwierdzam/i);
  if ((await confirm.count()) > 0) {
    await confirm.check();
  }
  await page.getByRole("button", { name: /^Start$/ }).click();
  await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });
}

test("US6: attention, restart persistence, and resume", async () => {
  const folderA = mkdtempSync(join(tmpdir(), "ster-e2e-us6-a-"));
  const folderB = mkdtempSync(join(tmpdir(), "ster-e2e-us6-b-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us6-data-"));

  const launch = async (folder: string) =>
    electron.launch({
      args: [resolve(desktopRoot, "out/main/index.js"), `--user-data-dir=${userData}`],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        STER_E2E_FOLDER: folder,
        STER_NODE_BINARY: process.execPath,
      },
    });

  const app1 = await launch(folderA);
  const page1 = await app1.firstWindow();
  await page1.waitForLoadState("domcontentloaded");
  let sessionA = "";
  let sessionB = "";
  try {
    await bootSession(page1);
    sessionA =
      (await page1
        .getByTestId(/^session-card-/)
        .first()
        .getAttribute("data-testid")) ?? "";
    sessionA = sessionA.replace("session-card-", "");

    // Create second session in folder B by relaunching picker env via new dialog —
    // close and reopen with folder B for the second session in the same app by
    // setting folder through a second new-session after swapping env is not possible
    // mid-process; instead create another session still in A then rename, and use
    // approval attention on the first while selecting the second.
    await page1.getByTestId("new-session").click();
    await page1.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
    const confirm = page1.getByLabel(/Confirm|Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page1.getByRole("button", { name: /^Start$/ }).click();
    await expect(page1.getByTestId(/^session-card-/)).toHaveCount(2, { timeout: 30_000 });

    const cards = page1.getByTestId(/^session-card-/);
    sessionB = (await cards.nth(0).getAttribute("data-testid"))?.replace("session-card-", "") ?? "";
    if (sessionB === sessionA) {
      sessionB =
        (await cards.nth(1).getAttribute("data-testid"))?.replace("session-card-", "") ?? "";
    }

    // Select B, then trigger approval on A via... we can only prompt the selected session.
    // Select A, start edit-file, then click B — attention should show on A.
    await page1.getByTestId(`session-card-${sessionA}`).click();
    const composer = page1.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: edit-file");
    await page1.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page1.getByRole("button", { name: /Allow once|Allow/i })).toBeVisible({
      timeout: 30_000,
    });
    await page1.getByTestId(`session-card-${sessionB}`).click();
    await expect(page1.getByTestId(`attention-${sessionA}`)).toBeVisible({ timeout: 15_000 });

    // Resolve approval so dispose is clean.
    await page1.getByTestId(`session-card-${sessionA}`).click();
    await page1.getByRole("button", { name: /Allow once|Allow/i }).click();
    await expect(page1.locator('[data-testid^="action-"][data-status="completed"]')).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await app1.close();
  }

  const app2 = await launch(folderA);
  const page2 = await app2.firstWindow();
  await page2.waitForLoadState("domcontentloaded");
  try {
    await expect(page2.getByTestId(/^session-card-/)).toHaveCount(2, { timeout: 30_000 });
    await page2.getByTestId(`session-card-${sessionA}`).click();
    await expect(page2.getByTestId("history-view")).toBeVisible({ timeout: 15_000 });
    await expect(page2.getByTestId("history-continue")).toBeVisible();
    await page2.getByTestId("history-continue").click();
    await expect(page2.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });
    await expect(page2.getByTestId("history-view")).toHaveCount(0);

    const composer = page2.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: hello");
    await page2.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page2.getByText(/Hello from the mock agent/i)).toBeVisible({ timeout: 30_000 });
  } finally {
    await app2.close();
    rmSync(folderA, { recursive: true, force: true });
    rmSync(folderB, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
