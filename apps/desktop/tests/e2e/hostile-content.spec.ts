import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("hostile agent content never runs scripts or loads remote media (SC-016)", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-hostile-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-hostile-data-"));
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
    const confirm = page.getByLabel(/Confirm|Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });

    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: hostile-content");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();

    await expect(page.getByText(/Hostile content sample/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/imageBlocked|Remote image blocked|obraz/i)).toBeVisible();
    // Bundled app scripts exist; hostile agent HTML must not inject scripts into the transcript.
    await expect(page.locator(".msg script")).toHaveCount(0);
    await expect(page.locator('.msg img[src^="http"]')).toHaveCount(0);
    expect(dialogs).toEqual([]);

    // Control sequences should not leave CSI markers in the rendered transcript.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.includes(String.fromCharCode(0x1b))).toBe(false);
    await expect(page.getByText(/Control seq:.*RED.*plain/)).toBeVisible();

    // Link open requires an explicit click through the confirm bridge — button exists.
    await expect(page.getByRole("button", { name: /click me/i })).toBeVisible();
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
