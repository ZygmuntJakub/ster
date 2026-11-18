import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createLogger, type LogRecord } from "../../src/log.js";
import { mergeFallbackPath, parseEnvDump, resolveShellEnv } from "../../src/platform/shell-env.js";

function fakeChild(stdout: string, exitCode = 0): EventEmitter {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn();
  queueMicrotask(() => {
    child.stdout.emit("data", stdout);
    child.emit("close", exitCode);
  });
  return child;
}

describe("parseEnvDump", () => {
  it("extracts KEY=value lines between markers", () => {
    const dump = [
      "noise",
      "__STER_ENV_BEGIN__",
      "PATH=/bin",
      "FOO=bar=baz",
      "__STER_ENV_END__",
      "",
    ].join("\n");
    expect(parseEnvDump(dump)).toEqual({ PATH: "/bin", FOO: "bar=baz" });
  });

  it("returns null when markers are missing", () => {
    expect(parseEnvDump("PATH=/bin")).toBeNull();
  });
});

describe("mergeFallbackPath", () => {
  it("prepends common package-manager bins without dropping existing PATH", () => {
    const env = mergeFallbackPath(
      { PATH: "/custom/bin", HOME: "/Users/me" },
      "/Users/me",
      "darwin",
    );
    expect(env["PATH"]?.startsWith("/Users/me/Library/pnpm:")).toBe(true);
    expect(env["PATH"]?.endsWith("/custom/bin")).toBe(true);
  });
});

describe("resolveShellEnv", () => {
  it("returns the process environment on Windows", async () => {
    const result = await resolveShellEnv({
      platform: "win32",
      env: { PATH: "C:\\Windows", USERNAME: "jakub" },
    });
    expect(result.source).toBe("process");
    expect(result.env).toEqual({ PATH: "C:\\Windows", USERNAME: "jakub" });
  });

  it("parses login-shell output on Unix", async () => {
    const spawnFn = vi.fn(() =>
      fakeChild("__STER_ENV_BEGIN__\nPATH=/from/shell\nHOME=/Users/me\n__STER_ENV_END__\n"),
    );
    const result = await resolveShellEnv({
      platform: "darwin",
      env: { SHELL: "/bin/zsh", PATH: "/old" },
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
    });
    expect(result.source).toBe("login-shell");
    expect(result.env["PATH"]).toBe("/from/shell");
    expect(spawnFn).toHaveBeenCalled();
  });

  it("falls back and logs when the login shell times out", async () => {
    const records: LogRecord[] = [];
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
        stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
      child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
      child.kill = vi.fn();
      return child;
    });

    const result = await resolveShellEnv({
      platform: "linux",
      timeoutMs: 20,
      homeDir: "/home/me",
      env: { SHELL: "/bin/bash", PATH: "/usr/bin" },
      spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
      log: createLogger({
        sink: (record) => {
          records.push(record);
        },
      }),
    });

    expect(result.source).toBe("fallback");
    expect(result.env["PATH"]?.includes("/home/me/.local/bin")).toBe(true);
    expect(result.env["PATH"]?.includes("/usr/bin")).toBe(true);
    expect(records.some((r) => r.level === "warn")).toBe(true);
  });
});
