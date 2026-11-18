import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SterError } from "../../src/errors.js";
import { createSettingsService } from "../../src/settings/service.js";
import { openSqliteStore } from "../../src/store/sqlite.js";

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("SettingsService", () => {
  it("defaults and persists settings", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ster-settings-"));
    dirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    try {
      const settings = createSettingsService({ store });
      expect(settings.get()).toMatchObject({
        language: "en",
        defaultPermissionMode: "always-ask",
        theme: "system",
      });
      settings.set({ language: "pl", theme: "dark" });
      expect(settings.get().language).toBe("pl");
      expect(settings.get().theme).toBe("dark");
    } finally {
      store.close();
    }
  });

  it("seeds first-launch defaults without overwriting existing settings", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ster-settings-"));
    dirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    try {
      const first = createSettingsService({
        store,
        defaults: { language: "pl", theme: "dark" },
      });
      expect(first.get().language).toBe("pl");
      expect(first.get().theme).toBe("dark");

      first.set({ language: "en" });
      const second = createSettingsService({
        store,
        defaults: { language: "pl", theme: "light" },
      });
      expect(second.get().language).toBe("en");
      expect(second.get().theme).toBe("dark");
    } finally {
      store.close();
    }
  });

  it("refuses managed keys", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ster-settings-"));
    dirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    try {
      const settings = createSettingsService({
        store,
        managedKeys: ["defaultPermissionMode"],
        managedValues: { defaultPermissionMode: "ask-with-rules" },
      });
      expect(settings.managedKeys()).toEqual(["defaultPermissionMode"]);
      expect(settings.get().defaultPermissionMode).toBe("ask-with-rules");
      expect(() => settings.set({ defaultPermissionMode: "always-ask" })).toThrow(SterError);
    } finally {
      store.close();
    }
  });
});
