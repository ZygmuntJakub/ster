import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

/**
 * Smoke-test a packaged Electron build (T132).
 * Skipped in regular CI unless STER_PACKAGED_APP points at the app binary / .app / executable.
 * release.yml sets that env after building installers / --dir output.
 */
const packagedApp = process.env["STER_PACKAGED_APP"];

test.describe("packaged smoke", () => {
  test.skip(!packagedApp, "STER_PACKAGED_APP not set — run from release.yml after packaging");

  test("launch packaged app, start mock session, see reply", async () => {
    const folder = mkdtempSync(join(tmpdir(), "ster-packaged-cwd-"));
    const userData = mkdtempSync(join(tmpdir(), "ster-packaged-data-"));
    const appPath = packagedApp as string;

    const launchOptions: Parameters<typeof electron.launch>[0] = {
      args: [`--user-data-dir=${userData}`],
      env: {
        ...process.env,
        NODE_ENV: "test",
        STER_E2E_FOLDER: folder,
        STER_NODE_BINARY: process.env["STER_NODE_BINARY"] ?? process.execPath,
      },
    };
    if (appPath.endsWith(".app")) {
      launchOptions.args = [appPath, `--user-data-dir=${userData}`];
    } else {
      launchOptions.executablePath = appPath;
    }

    const app = await electron.launch(launchOptions);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    try {
      await page.getByTestId("new-session").click();
      await page.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
      const confirm = page.getByLabel(/Confirm|Potwierdzam/i);
      if ((await confirm.count()) > 0) {
        await confirm.check();
      }
      await page.getByRole("button", { name: /^Start$/ }).click();
      await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 60_000 });

      const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
      await composer.fill("scenario: hello");
      await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
      await expect(page.getByText(/Hello from the mock agent/)).toBeVisible({ timeout: 60_000 });
    } finally {
      await app.close();
      rmSync(folder, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
    }
  });
});
