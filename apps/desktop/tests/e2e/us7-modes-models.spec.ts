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

test("US7: mode/model selectors and slash commands", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us7-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us7-data-"));

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

    await expect(page.getByTestId("config-options")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("config-option-model")).toBeVisible();
    await expect(page.getByTestId("config-option-mode")).toBeVisible();

    const modelSelect = page.getByTestId("config-option-model").locator("select");
    await modelSelect.selectOption("mock-large");
    await expect(modelSelect).toHaveValue("mock-large");

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: commands");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByText(/Commands available|Dostępne polecenia/i)).toBeVisible({
      timeout: 30_000,
    });

    await composer.fill("/");
    await expect(page.getByTestId("command-menu")).toBeVisible();
    await expect(page.getByTestId("command-status")).toBeVisible();
    await page.getByTestId("command-status").click();
    await expect(composer).toHaveValue("");
    await expect(page.getByText(/\/status/)).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
