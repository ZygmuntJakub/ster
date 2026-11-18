import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isSterError } from "../../src/errors.js";
import {
  readWorkspaceTextFile,
  resolveWorkspacePath,
  writeWorkspaceTextFile,
} from "../../src/workspace/files.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("workspace path confinement", () => {
  it("resolves relative paths inside the cwd", () => {
    const cwd = tempDir("ster-ws-");
    writeFileSync(join(cwd, "notes.txt"), "hello\n", "utf8");
    const resolved = resolveWorkspacePath(cwd, "notes.txt");
    expect(resolved).toBe(join(realpathSync(cwd), "notes.txt"));
    expect(readWorkspaceTextFile(cwd, "notes.txt").content).toBe("hello\n");
  });

  it("rejects .. escapes", () => {
    const parent = tempDir("ster-ws-parent-");
    const cwd = join(parent, "project");
    mkdirSync(cwd);
    writeFileSync(join(parent, "secret.txt"), "nope\n", "utf8");

    expect(() => resolveWorkspacePath(cwd, "../secret.txt")).toThrow();
    try {
      resolveWorkspacePath(cwd, "../secret.txt");
    } catch (error) {
      expect(isSterError(error) && error.code === "outside-workspace").toBe(true);
    }
  });

  it("rejects absolute paths outside the workspace", () => {
    const cwd = tempDir("ster-ws-abs-");
    const outside = join(tempDir("ster-ws-out-"), "file.txt");
    writeFileSync(outside, "x\n", "utf8");
    expect(() => resolveWorkspacePath(cwd, outside)).toThrow();
    try {
      resolveWorkspacePath(cwd, outside);
    } catch (error) {
      expect(isSterError(error) && error.code === "outside-workspace").toBe(true);
    }
  });

  it("rejects symlinks that point outside the workspace", () => {
    const parent = tempDir("ster-ws-link-parent-");
    const cwd = join(parent, "project");
    mkdirSync(cwd);
    const outside = join(parent, "outside.txt");
    writeFileSync(outside, "secret\n", "utf8");
    const link = join(cwd, "escape.txt");
    symlinkSync(outside, link);

    expect(() => resolveWorkspacePath(cwd, "escape.txt")).toThrow();
    try {
      resolveWorkspacePath(cwd, "escape.txt");
    } catch (error) {
      expect(isSterError(error) && error.code === "outside-workspace").toBe(true);
    }
  });

  it("allows writing a new nested file inside the workspace", () => {
    const cwd = tempDir("ster-ws-write-");
    const root = realpathSync(cwd);
    const { resolvedPath } = writeWorkspaceTextFile(cwd, "nested/a.txt", "ok\n");
    expect(resolvedPath.startsWith(root + "/")).toBe(true);
    expect(readWorkspaceTextFile(cwd, "nested/a.txt").content).toBe("ok\n");
  });

  it("accepts absolute paths that use a non-realpath cwd prefix", () => {
    const cwd = tempDir("ster-ws-abs-in-");
    const absolute = join(cwd, "inside.txt");
    writeFileSync(absolute, "in\n", "utf8");
    const resolved = resolveWorkspacePath(cwd, absolute);
    expect(resolved).toBe(realpathSync(absolute));
  });
});
