import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

test("US4: list registry agent, install binary, add custom", async () => {
  const binary = Buffer.from("#!/bin/sh\necho e2e-agent\n");
  const files: Record<string, string | Buffer> = { "/agent.bin": binary };
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";
    const body = files[path];
    if (body === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    res.writeHead(200, {
      "content-type": path.endsWith(".json") ? "application/json" : "application/octet-stream",
    });
    res.end(buf);
  });
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", () => {
      resolveListen();
    }),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("no port");
  }
  const base = `http://127.0.0.1:${String(address.port)}`;
  const target = {
    archive: `${base}/agent.bin`,
    cmd: "./ster-e2e-agent",
    sha256: sha256(binary),
  };
  files["/registry.json"] = JSON.stringify({
    version: "1.0.0",
    agents: [
      {
        id: "e2e-agent",
        name: "E2E Agent",
        version: "1.0.0",
        distribution: {
          binary: {
            "darwin-aarch64": target,
            "darwin-x86_64": target,
            "linux-x86_64": target,
            "linux-aarch64": target,
            "linux-x86_64-musl": target,
            "linux-aarch64-musl": target,
            "windows-x86_64": target,
            "windows-aarch64": target,
          },
        },
      },
    ],
  });

  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-us4-data-"));
  const app = await electron.launch({
    args: [resolve(desktopRoot, "out/main/index.js"), `--user-data-dir=${userData}`],
    cwd: desktopRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      STER_NODE_BINARY: process.execPath,
      STER_REGISTRY_URL: `${base}/registry.json`,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.getByRole("button", { name: /^Agents$|^Agenci$/ }).click();
    await expect(page.getByTestId("agent-list")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Refresh registry|Odśwież rejestr/i }).click();
    const row = page.getByTestId("agent-e2e-agent");
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-readiness", "not-installed", { timeout: 15_000 });
    await row.getByRole("button", { name: /Install|Zainstaluj/ }).click();
    await expect(page.getByTestId("install-dialog")).toBeVisible();
    await expect(page.getByTestId("install-verified")).toContainText(/verified|zweryfikowana/i);
    await page
      .getByTestId("install-dialog")
      .getByRole("button", { name: /^Install$|^Zainstaluj$/ })
      .click();
    await expect(page.getByTestId("agent-e2e-agent")).toHaveAttribute("data-readiness", "ready", {
      timeout: 30_000,
    });

    await page.getByTestId("custom-agent-form").locator("input").nth(0).fill("My Custom");
    await page.getByTestId("custom-agent-form").locator("input").nth(1).fill("/bin/echo");
    await page.getByTestId("custom-agent-form").locator("input").nth(2).fill("hi");
    await page.getByRole("button", { name: /Save custom agent|Zapisz własnego agenta/i }).click();
    await expect(page.locator('[data-testid^="agent-custom:"]')).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
    await new Promise<void>((resolveClose) =>
      server.close(() => {
        resolveClose();
      }),
    );
    rmSync(userData, { recursive: true, force: true });
  }
});
