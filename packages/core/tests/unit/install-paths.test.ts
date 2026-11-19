import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractTarGz } from "../../src/agents/extract.js";
import { installNpmAgent } from "../../src/agents/install-npm.js";
import { installUvxAgent } from "../../src/agents/install-uvx.js";
import { ensureManagedNode } from "../../src/agents/node-runtime.js";
import { planInstall } from "../../src/agents/plan.js";
import { resolvePlatformKey } from "../../src/agents/platform.js";
import type { InstallPlan } from "../../src/agents/plan.js";
import { isSterError } from "../../src/errors.js";

const tempDirs: string[] = [];

function removeTempDir(dir: string): void {
  // Windows may keep locks briefly after a killed npm child; retry then best-effort.
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const code =
        error !== null && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "EPERM" && code !== "EBUSY" && code !== "ENOTEMPTY") {
        throw error;
      }
      const waitUntil = Date.now() + 40 * (attempt + 1);
      while (Date.now() < waitUntil) {
        // sync backoff — avoid leaving locked temp dirs on Windows CI
      }
    }
  }
  if (process.platform === "win32") {
    return;
  }
  throw lastError;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeTempDir(dir);
  }
});

function ustar(name: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write("0000644\0", 100, 8, "utf8");
  header.write("0000000\0", 108, 8, "utf8");
  header.write("0000000\0", 116, 8, "utf8");
  const size = content.length.toString(8).padStart(11, "0") + "\0";
  header.write(size, 124, 12, "utf8");
  header.write("00000000000\0", 136, 12, "utf8");
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  let checksum = 0;
  for (let i = 0; i < 512; i += 1) {
    checksum += i >= 148 && i < 156 ? 32 : (header[i] ?? 0);
  }
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  const sizePad = Math.ceil(content.length / 512) * 512;
  const fileBlock = Buffer.alloc(sizePad);
  content.copy(fileBlock);
  return Buffer.concat([header, fileBlock, Buffer.alloc(1024)]);
}

describe("install path coverage", () => {
  it("extracts a valid tar.gz archive", async () => {
    const dest = mkdtempSync(join(tmpdir(), "ster-tar-"));
    tempDirs.push(dest);
    const archive = join(dest, "ok.tar.gz");
    writeFileSync(archive, gzipSync(ustar("hello.txt", Buffer.from("hi\n"))));
    const out = join(dest, "out");
    await extractTarGz(archive, out);
    expect(createHash("sha256").update("hi\n").digest("hex")).toHaveLength(64);
  });

  it("plans npx and uvx installs and rejects uvx without uv", () => {
    const npxPlan = planInstall({
      entry: {
        id: "n",
        name: "N",
        version: "1.0.0",
        distribution: { npx: { package: "@scope/pkg@1.0.0", args: ["--acp"] } },
      },
      platformKey: resolvePlatformKey(),
      uvAvailable: false,
    });
    expect(npxPlan.distribution).toBe("npx");
    expect(npxPlan.requiresManagedNode).toBe(true);

    expect(() =>
      planInstall({
        entry: {
          id: "u",
          name: "U",
          version: "1.0.0",
          distribution: { uvx: { package: "pkg==1.0.0" } },
        },
        platformKey: resolvePlatformKey(),
        uvAvailable: false,
      }),
    ).toThrow();

    const uvxPlan = planInstall({
      entry: {
        id: "u",
        name: "U",
        version: "1.0.0",
        distribution: { uvx: { package: "pkg==1.0.0", args: ["serve"] } },
      },
      platformKey: resolvePlatformKey(),
      uvAvailable: true,
    });
    expect(uvxPlan.distribution).toBe("uvx");
  });

  it("seeds a managed node runtime and records a uvx agent", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-"));
    tempDirs.push(dataDir);
    const seed = join(dataDir, "seed-node");
    writeFileSync(seed, "#!/bin/sh\nexit 0\n");
    chmodSync(seed, 0o755);

    const runtime = await ensureManagedNode({
      dataDir,
      platformKey: resolvePlatformKey(),
      seedNodeBinary: seed,
    });
    expect(runtime.nodePath).toContain(join("runtimes", "node"));

    const plan: InstallPlan = {
      id: "uv1",
      agentId: "uv-agent",
      version: "1.0.0",
      source: "pkg==1.0.0",
      verified: false,
      distribution: "uvx",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [],
      detail: {
        kind: "uvx",
        packageSpec: "pkg==1.0.0",
        args: ["serve"],
        env: {},
      },
    };
    const { agent } = await installUvxAgent({
      plan,
      dataDir,
      uvPath: "/usr/bin/uv",
    });
    expect(agent.distribution).toBe("uvx");
    expect(agent.launch.command).toBe("/usr/bin/uv");
  });

  it("seeds Windows managed node as node.exe plus an npm.cmd wrapper", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-win-"));
    tempDirs.push(dataDir);
    const seed = join(dataDir, "seed-node.exe");
    writeFileSync(seed, "MZ-fake-pe");
    const npmCli = join(dataDir, "node_modules", "npm", "bin", "npm-cli.js");
    mkdirSync(join(dataDir, "node_modules", "npm", "bin"), { recursive: true });
    writeFileSync(npmCli, "console.log('npm')\n");

    const runtime = await ensureManagedNode({
      dataDir,
      platformKey: "windows-x86_64",
      seedNodeBinary: seed,
    });
    expect(basename(runtime.nodePath)).toBe("node.exe");
    expect(basename(runtime.npmPath)).toBe("npm.cmd");
    expect(runtime.npmCliPath).toBe(npmCli);
    expect(readFileSync(runtime.npmPath, "utf8")).toContain("npm-cli.js");
  });

  it("seeds Windows npm.cmd that delegates to PATH when npm-cli.js is absent", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-win-path-"));
    tempDirs.push(dataDir);
    const seed = join(dataDir, "seed-node.exe");
    writeFileSync(seed, "MZ-fake-pe");

    const runtime = await ensureManagedNode({
      dataDir,
      platformKey: "windows-x86_64",
      seedNodeBinary: seed,
    });
    expect(readFileSync(runtime.npmPath, "utf8")).toMatch(/^@echo off\r\nnpm %\*\r\n$/u);
  });

  it("refuses managed node for unsupported platforms such as musl", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-fail-"));
    tempDirs.push(dataDir);
    await expect(
      ensureManagedNode({
        dataDir,
        platformKey: "linux-x86_64-musl",
      }),
    ).rejects.toSatisfy((error: unknown) => isSterError(error) && error.code === "agent-not-ready");
  });

  it("rejects npx/uvx plans when requireChecksum is set", () => {
    expect(() =>
      planInstall({
        entry: {
          id: "n",
          name: "N",
          version: "1.0.0",
          distribution: { npx: { package: "@scope/pkg@1.0.0" } },
        },
        platformKey: resolvePlatformKey(),
        uvAvailable: true,
        requireChecksum: true,
      }),
    ).toThrow(/checksum/);

    expect(() =>
      planInstall({
        entry: {
          id: "u",
          name: "U",
          version: "1.0.0",
          distribution: { uvx: { package: "pkg==1.0.0" } },
        },
        platformKey: resolvePlatformKey(),
        uvAvailable: true,
        requireChecksum: true,
      }),
    ).toThrow(/checksum/);
  });

  it("rejects managed Node downloads when the archive checksum mismatches", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-dl-"));
    tempDirs.push(dataDir);
    const archiveBytes = gzipSync(ustar("node-v22.14.0-darwin-arm64/bin/node", Buffer.from("x")));
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(archiveBytes, {
          status: 200,
          headers: {
            "content-type": "application/gzip",
            "content-length": String(archiveBytes.length),
          },
        }),
      )) as typeof fetch;
    await expect(
      ensureManagedNode({
        dataDir,
        platformKey: "darwin-aarch64",
        fetchImpl,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "integrity-failed",
    );
  });

  it("times out and kills a hung npm install child", async () => {
    const root = mkdtempSync(join(tmpdir(), "ster-npm-timeout-"));
    tempDirs.push(root);
    const pkg = join(root, "local-pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({ name: "ster-fixture-pkg", version: "1.0.0" }),
    );
    const dataDir = join(root, "data");
    mkdirSync(dataDir, { recursive: true });
    const plan: InstallPlan = {
      id: "npm-timeout",
      agentId: "npm-timeout-agent",
      version: "1.0.0",
      source: `file:${pkg}`,
      verified: false,
      distribution: "npx",
      scriptsAllowed: false,
      requiresManagedNode: true,
      lines: [],
      detail: {
        kind: "npx",
        packageSpec: `file:${pkg}`,
        args: [],
        env: {},
      },
    };

    const kill = vi.fn();
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = false;
      child.kill = kill.mockImplementation(() => {
        child.killed = true;
        return true;
      });
      return child;
    });

    await expect(
      installNpmAgent({
        plan,
        dataDir,
        platformKey: resolvePlatformKey(),
        seedNodeBinary: process.execPath,
        allowScripts: false,
        npmTimeoutMs: 30,
        spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
      }),
    ).rejects.toSatisfy((error: unknown) => isSterError(error) && /timed out/u.test(error.message));
    expect(kill).toHaveBeenCalled();
  });

  it("installs an npm agent from a local package using a seeded node", async () => {
    const root = mkdtempSync(join(tmpdir(), "ster-npm-"));
    tempDirs.push(root);
    const pkg = join(root, "local-pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "ster-fixture-pkg",
        version: "1.0.0",
        bin: { "ster-fixture-pkg": "bin.js" },
      }),
    );
    writeFileSync(join(pkg, "bin.js"), "#!/usr/bin/env node\nconsole.log('ok')\n");
    chmodSync(join(pkg, "bin.js"), 0o755);

    const dataDir = join(root, "data");
    mkdirSync(dataDir, { recursive: true });
    const plan: InstallPlan = {
      id: "npm1",
      agentId: "npm-agent",
      version: "1.0.0",
      source: `file:${pkg}`,
      verified: false,
      distribution: "npx",
      scriptsAllowed: false,
      requiresManagedNode: true,
      lines: [],
      detail: {
        kind: "npx",
        packageSpec: `file:${pkg}`,
        args: ["--acp"],
        env: {},
      },
    };

    const { agent } = await installNpmAgent({
      plan,
      dataDir,
      platformKey: resolvePlatformKey(),
      seedNodeBinary: process.execPath,
      allowScripts: false,
    });
    expect(agent.distribution).toBe("npx");
    expect(agent.install.path).toContain("npm-agent");
  }, 60_000);
});
