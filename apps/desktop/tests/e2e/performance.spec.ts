import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("five sessions switch quickly and virtual list stays interactive (SC-006, SC-008)", async () => {
  const folder = mkdtempSync(join(tmpdir(), "ster-e2e-perf-"));
  const userData = mkdtempSync(join(tmpdir(), "ster-e2e-perf-data-"));
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
    const sessionIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId("new-session").click();
      await page.getByRole("button", { name: /Choose folder|Wybierz folder/ }).click();
      const confirm = page.getByLabel(/Confirm|Potwierdzam/i);
      if ((await confirm.count()) > 0) {
        await confirm.check();
      }
      await page.getByRole("button", { name: /^Start$/ }).click();
      await expect(page.getByTestId("session-title")).toBeVisible({ timeout: 30_000 });
      const id = await page.getByTestId("session-title").getAttribute("data-session-id");
      if (id) {
        sessionIds.push(id);
      }
    }

    const cards = page.locator("[data-testid^=session-card-]");
    await expect(cards).toHaveCount(5, { timeout: 10_000 });

    const switchStart = Date.now();
    await cards.nth(0).click();
    await cards.nth(4).click();
    await cards.nth(2).click();
    expect(Date.now() - switchStart).toBeLessThan(3_000);

    // Drive the store through a custom event the ConversationPane listens for in tests.
    const firstCard = cards.nth(0);
    const testId = await firstCard.getAttribute("data-testid");
    const sessionId = (testId ?? "").replace("session-card-", "");
    expect(sessionId.length).toBeGreaterThan(0);
    await firstCard.click();

    const seeded = await page.evaluate(async (id) => {
      const g = globalThis as unknown as {
        ster: { sessions: { get: (p: { sessionId: string }) => Promise<{ id: string }> } };
        dispatchEvent: (event: Event) => boolean;
        CustomEvent: new (type: string, init?: { detail?: unknown }) => Event;
      };
      const detail = await g.ster.sessions.get({ sessionId: id });
      const items = Array.from({ length: 1000 }, (_, index) => ({
        sessionId: detail.id,
        seq: index + 1,
        kind: index % 2 === 0 ? "agent-message" : "user-message",
        runId: "perf",
        createdAt: new Date().toISOString(),
        payload: { text: `perf-item-${String(index)}` },
      }));
      g.dispatchEvent(
        new g.CustomEvent("ster:test-seed-items", { detail: { sessionId: detail.id, items } }),
      );
      return { ok: true, sessionId: detail.id, count: items.length };
    }, sessionId);
    expect(seeded.ok).toBe(true);

    await expect(page.getByTestId("conversation-scroll")).toBeVisible({ timeout: 5_000 });
    const mounted = await page.locator("[data-testid=conversation-scroll] [data-index]").count();
    // Virtualised: far fewer than 1000 DOM rows.
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(200);

    const composer = page.getByPlaceholder(/Message the agent|Napisz do agenta/);
    const typeStart = Date.now();
    await composer.fill("scenario: hello");
    expect(Date.now() - typeStart).toBeLessThan(1_000);
    await page.getByRole("button", { name: /^Send$|^Wyślij$/ }).click();
    await expect(page.getByText(/Hello from the mock agent/i)).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});
