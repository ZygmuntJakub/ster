import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("US12: runs view lists a completed turn and opens detail", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us12-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us12-data-"));

  const app = await electron.launch({
    args: [resolve(desktopRoot, "out/main/index.js"), `--user-data-dir=${userData}`],
    cwd: desktopRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      STER_E2E_FOLDER: folder,
      STER_NODE_BINARY: process.execPath,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  try {
    await page.getByTestId("new-session").click();
    await page.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
    const confirm = page.getByLabel(/confirm|Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: hello");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByText(/Hello from the mock agent/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Runs$|^Przebiegi$/ }).click();
    await expect(page.getByTestId("runs-view")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("runs-totals")).toContainText(/1|2/);

    const firstRow = page.locator("[data-testid^=run-row-]").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByTestId("run-detail")).toBeVisible();
    await expect(page.getByTestId("run-rate")).toBeVisible();
    await page.getByTestId("run-rating-input").fill("5");
    await page.getByTestId("run-rate-save").click();
    await expect(page.getByTestId("run-score-user")).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
