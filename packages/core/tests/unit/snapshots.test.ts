import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSnapshotStore, hashFileContent } from "../../src/workspace/snapshots.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("file snapshots", () => {
  it("hashes content stably", () => {
    expect(hashFileContent("a\n")).toBe(hashFileContent("a\n"));
    expect(hashFileContent("a\n")).not.toBe(hashFileContent("b\n"));
  });

  it("detects stale paths after an external edit", () => {
    const dir = mkdtempSync(join(tmpdir(), "ster-snap-"));
    tempDirs.push(dir);
    const path = join(dir, "file.txt");
    writeFileSync(path, "v1\n", "utf8");

    const store = createSnapshotStore();
    store.record("s1", path, "v1\n");
    expect(store.isStale("s1", path)).toBe(false);

    writeFileSync(path, "v2\n", "utf8");
    expect(store.isStale("s1", path)).toBe(true);

    store.clearSession("s1");
    expect(store.isStale("s1", path)).toBe(false);
  });
});
