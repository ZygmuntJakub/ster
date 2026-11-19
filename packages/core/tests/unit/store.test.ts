import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteStore, type SqliteStore } from "../../src/store/sqlite.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function tempDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ster-store-"));
  tempDirs.push(dir);
  return dir;
}

describe("SqliteStore", () => {
  it("runs migrations and records the applied version", async () => {
    const dataDir = await tempDataDir();
    const store = openSqliteStore({ dataDir });
    try {
      expect(store.migrationVersion()).toBeGreaterThanOrEqual(1);
      expect(store.listAppliedMigrations()).toContain(1);
    } finally {
      store.close();
    }
  });

  it("creates the data directory and database with user-only permissions on POSIX", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dataDir = await tempDataDir();
    const store = openSqliteStore({ dataDir });
    try {
      const dirMode = (await stat(dataDir)).mode & 0o777;
      const fileMode = (await stat(store.dbPath)).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    } finally {
      store.close();
    }
  });

  it("appends conversation items in order and pages backwards", async () => {
    const dataDir = await tempDataDir();
    const store = openSqliteStore({ dataDir });
    try {
      store.putSession({
        id: "s1",
        agentId: "mock",
        agentVersion: "0",
        cwd: "/tmp/project",
        title: "Test",
        status: "idle",
        permissionMode: "always-ask",
        createdAt: "2026-11-18T12:00:00.000Z",
        lastActivityAt: "2026-11-18T12:00:00.000Z",
        payloadJson: "{}",
      });

      for (let i = 1; i <= 5; i += 1) {
        store.appendItem({
          sessionId: "s1",
          kind: "agent-message",
          runId: "r1",
          createdAt: `2026-11-18T12:00:0${String(i)}.000Z`,
          payloadJson: JSON.stringify({ text: `m${String(i)}` }),
        });
      }

      const latest = store.listItems("s1", { limit: 2 });
      expect(latest.map((row) => row.seq)).toEqual([5, 4]);

      const older = store.listItems("s1", { before: 4, limit: 2 });
      expect(older.map((row) => row.seq)).toEqual([3, 2]);

      const updated = store.updateItemPayload("s1", 5, JSON.stringify({ text: "m5-final" }));
      expect(JSON.parse(updated.payloadJson)).toEqual({ text: "m5-final" });
    } finally {
      store.close();
    }
  });

  it("persists settings across reopen", async () => {
    const dataDir = await tempDataDir();
    let store: SqliteStore = openSqliteStore({ dataDir });
    store.setSetting("language", "pl");
    store.close();

    store = openSqliteStore({ dataDir });
    try {
      expect(store.getSetting("language")).toBe("pl");
      expect(store.migrationVersion()).toBeGreaterThanOrEqual(1);
    } finally {
      store.close();
    }
  });
});
