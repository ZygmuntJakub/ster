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

test("US5: run-command shows live output; run-long can be stopped", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us5-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us5-data-"));
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
    await bootSession(page);

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: run-command");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();

    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Allow once|Allow/i }).click();

    await expect(page.locator('[data-testid^="command-"][data-state]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-testid^="command-output-"]')).toContainText(
      "hello-from-command",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("command-exit")).toBeVisible({ timeout: 30_000 });

    await composer.fill("scenario: run-long");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Allow once|Allow/i }).click();

    const stop = page.locator('[data-testid^="command-stop-"]');
    await expect(stop).toBeVisible({ timeout: 30_000 });
    await stop.click();
    await expect(page.locator('[data-testid^="command-"][data-state="killed"]')).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
