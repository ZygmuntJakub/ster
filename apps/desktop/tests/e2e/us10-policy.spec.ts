import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("US10: app.info exposes policy state; settings stay usable", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us10-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us10-data-"));

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
    const info = await page.evaluate(async () => {
      const ster = (
        globalThis as unknown as {
          ster: {
            app: {
              info: () => Promise<{
                policyState: string;
                managedSettings?: string[];
                effectivePolicy?: { items: unknown[] };
              }>;
            };
          };
        }
      ).ster;
      return ster.app.info();
    });
    expect(["absent", "valid", "invalid"]).toContain(info.policyState);
    expect(Array.isArray(info.managedSettings)).toBe(true);
    expect(info.effectivePolicy?.items).toBeDefined();

    // Builtin policy.default.json → valid with no managed items in default packaging.
    if (info.policyState === "valid") {
      await expect(page.getByTestId("policy-invalid-banner")).toHaveCount(0);
    }

    await page.getByRole("button", { name: /Settings|Ustawienia/ }).click();
    await expect(page.getByTestId("settings-pane")).toBeVisible();
    await expect(page.getByTestId("permission-settings")).toBeVisible();

    await page.getByRole("button", { name: /Agents|Agenci/ }).click();
    await expect(page.getByTestId("agent-list")).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
