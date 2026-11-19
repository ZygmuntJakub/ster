import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("renderer cannot reach registry or arbitrary HTTPS hosts (SC-012)", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-net-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-net-data-"));

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
    const probes = await page.evaluate(async () => {
      const tryFetch = async (url: string) => {
        try {
          const response = await fetch(url);
          return { url, ok: response.ok, status: response.status };
        } catch (error) {
          return {
            url,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      };
      return {
        registry: await tryFetch(
          "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json",
        ),
        evil: await tryFetch("https://evil.example/"),
      };
    });
    expect(probes.registry.ok).toBe(false);
    expect(probes.evil.ok).toBe(false);

    // US1/US4 smoke: start a session and open agents without the renderer talking to the CDN.
    await page.getByTestId("new-session").click();
    await page.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
    const confirm = page.getByLabel(/Confirm|Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Agents$|^Agenci$/ }).click();
    await expect(page.getByText(/Mock|mock-agent/i).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
