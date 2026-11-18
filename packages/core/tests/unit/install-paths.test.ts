import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { extractTarGz } from "../../src/agents/extract.js";
import { installNpmAgent } from "../../src/agents/install-npm.js";
import { installUvxAgent } from "../../src/agents/install-uvx.js";
import { ensureManagedNode } from "../../src/agents/node-runtime.js";
import { planInstall } from "../../src/agents/plan.js";
import { resolvePlatformKey } from "../../src/agents/platform.js";
import type { InstallPlan } from "../../src/agents/plan.js";
import { isSterError } from "../../src/errors.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
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
    expect(runtime.nodePath).toContain("runtimes/node");

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

  it("refuses managed node download when checksums are unset", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-rt-fail-"));
    tempDirs.push(dataDir);
    await expect(
      ensureManagedNode({
        dataDir,
        platformKey: resolvePlatformKey(),
      }),
    ).rejects.toSatisfy((error: unknown) => isSterError(error) && error.code === "agent-not-ready");
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
  });
});
