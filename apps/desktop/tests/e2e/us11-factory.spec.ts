import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("US11: untrusted factory prompts for trust; trusted applies defaults", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-us11-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us11-data-"));
  mkdirSync(join(folder, ".ster"), { recursive: true });
  writeFileSync(
    join(folder, ".ster", "factory.yaml"),
    [
      "version: 1",
      "agents:",
      "  - id: mock-agent",
      "defaultAgent: mock-agent",
      "permissionMode: always-ask",
      "templates:",
      "  - id: hello",
      "    title: Hello",
      '    prompt: "Say hello to {{name}}"',
      "    inputs:",
      "      - name: name",
      "        label: Name",
      "        default: world",
      "",
    ].join("\n"),
  );

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
    await expect(page.getByTestId("factory-trust-dialog")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Trust definition|Zaufaj definicji/ }).click();
    await expect(page.getByTestId("factory-trust-dialog")).toHaveCount(0, { timeout: 15_000 });

    const confirm = page.getByLabel(/confirm|Potwierdzam/i);
    if ((await confirm.count()) > 0) {
      await confirm.check();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("factory-template-picker")).toBeVisible();
    await page.getByTestId("factory-template-picker").getByRole("button").first().click();
    await page.getByRole("button", { name: /Insert|Wstaw/ }).click();
    await expect(page.getByPlaceholder(/Message the agent|Napisz do agenta/)).toHaveValue(
      /Say hello to world/,
    );
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
