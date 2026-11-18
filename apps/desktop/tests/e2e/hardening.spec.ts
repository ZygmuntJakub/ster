import { test, expect } from "@playwright/test";
import { launchApp } from "./launch.js";

test("renderer has no Node globals and blocks navigation plus remote loads", async () => {
  const { app, page } = await launchApp();
  try {
    const nodeGlobals = await page.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process,
      Buffer: typeof (globalThis as { Buffer?: unknown }).Buffer,
      __dirname: typeof (globalThis as { __dirname?: unknown }).__dirname,
    }));
    expect(nodeGlobals).toEqual({
      require: "undefined",
      process: "undefined",
      Buffer: "undefined",
      __dirname: "undefined",
    });

    const navigated = await page.evaluate(async () => {
      const loc = (globalThis as unknown as { location: { href: string } }).location;
      const before = loc.href;
      try {
        loc.href = "https://example.com/";
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 200));
      return { before, after: loc.href };
    });
    expect(navigated.after).toBe(navigated.before);
    expect(navigated.after.startsWith("https://")).toBe(false);

    const remoteBlocked = await page.evaluate(async () => {
      try {
        const response = await fetch("https://example.com/");
        return { ok: response.ok, status: response.status };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    expect(remoteBlocked.ok).toBe(false);
  } finally {
    await app.close();
  }
});
