import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("US3: remember edits, auto-approve reads, reject outside guard", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us3-"));
  writeFileSync(join(folder, "readme.md"), "# readme\n", "utf8");
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us3-data-"));
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

    const mode = page.getByTestId("permission-mode").locator("select");
    await mode.selectOption("ask-with-rules");
    await expect(mode).toHaveValue("ask-with-rules");
    // Ensure main-process mode is committed before the first prompt (macOS IPC can lag the UI).
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const ster = globalThis as unknown as {
            document: {
              querySelector: (sel: string) => { getAttribute: (n: string) => string | null } | null;
            };
            ster: {
              sessions: {
                get: (payload: { sessionId: string }) => Promise<{ permissionMode?: string }>;
              };
            };
          };
          const sessionId = ster.document
            .querySelector("[data-testid='session-title']")
            ?.getAttribute("data-session-id");
          if (!sessionId) {
            return null;
          }
          const session = await ster.ster.sessions.get({ sessionId });
          return session.permissionMode ?? null;
        });
      })
      .toBe("ask-with-rules");

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    await composer.fill("scenario: edit-file");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();

    await expect(page.getByRole("button", { name: /remember|zapamiętaj/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /remember|zapamiętaj/i }).click();
    await expect(page.getByTestId("rules-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("permission-notice").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toHaveCount(0);

    const noticesBefore = await page.getByTestId("permission-notice").count();
    await composer.fill("scenario: edit-file");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByTestId("permission-notice")).toHaveCount(noticesBefore + 1, {
      timeout: 30_000,
    });
    await expect(
      page.getByTestId("permission-notice").filter({
        hasText: /Approved automatically by a remembered decision|automatycznie na podstawie/i,
      }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toHaveCount(0);

    await page
      .getByTestId("rules-panel")
      .getByRole("button", { name: /Revoke|Cofnij/i })
      .click();
    await expect(page.getByTestId("rules-panel")).toHaveCount(0);

    await mode.selectOption("auto-approve-reads");
    await composer.fill("scenario: read-then-edit");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Allow once|Allow/i }).click();
    await expect(
      page.getByText(/Approved automatically by the permission mode|przez tryb uprawnień/i),
    ).toBeVisible({ timeout: 15_000 });

    await composer.fill("scenario: escape-workspace");
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByRole("button", { name: /Allow once|Allow/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Allow once|Allow/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("dialog").locator('[data-option-id="reject"]').click();
    await expect(page.getByText(/outside-workspace|Write failed/i).first()).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
