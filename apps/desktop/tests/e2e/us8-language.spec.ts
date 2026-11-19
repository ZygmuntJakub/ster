import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function openSettings(page: import("playwright").Page): Promise<void> {
  await page.getByRole("button", { name: /Settings|Ustawienia/ }).click();
  await expect(page.getByTestId("settings-pane")).toBeVisible();
}

test("US8: switch language live; agent content stays untranslated", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us8-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us8-data-"));

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
    await openSettings(page);
    const language = page.getByTestId("language-setting").locator("select");
    await language.selectOption("pl");

    await expect(page.getByRole("heading", { name: "Ustawienia" })).toBeVisible();
    await expect(page.getByTestId("settings-pane")).toContainText("Język");
    // No raw i18n keys should leak into the settings UI.
    await expect(page.getByTestId("settings-pane")).not.toContainText("settings.");

    await page.getByRole("button", { name: "Rozmowa" }).click();
    await expect(page.getByText("Sesje")).toBeVisible();
    const sessionCount = page.getByTestId("session-count");
    await expect(sessionCount).toBeVisible();
    await expect(sessionCount).toContainText(/sesj/i);

    await page.getByTestId("new-session").click();
    await page.getByRole("button", { name: /Wybierz folder/ }).click();
    const confirm = page.getByLabel(/Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });

    const composer = page.getByPlaceholder(/Napisz do agenta/);
    await composer.fill("scenario: hello");
    await page.getByRole("button", { name: /^Wyślij$/ }).click();

    // FR-037: agent-produced English content must not be translated by the app.
    await expect(page.getByText("Hello from the mock agent")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Wyślij")).toBeVisible();

    await openSettings(page);
    await language.selectOption("en");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("settings-pane")).toContainText("Language");
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
