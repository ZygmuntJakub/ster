import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { installBinaryAgent } from "../../src/agents/install-binary.js";
import { assertSafeBinaryCmd } from "../../src/agents/integrity.js";
import { extractTarGz } from "../../src/agents/extract.js";
import { isSterError } from "../../src/errors.js";
import type { InstallPlan } from "../../src/agents/plan.js";

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

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
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  const sizePad = Math.ceil(content.length / 512) * 512;
  const fileBlock = Buffer.alloc(sizePad);
  content.copy(fileBlock);
  return Buffer.concat([header, fileBlock, Buffer.alloc(1024)]);
}

async function serve(files: Record<string, Buffer>): Promise<string> {
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";
    const body = files[path];
    if (!body) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-length": body.length });
    res.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      resolve();
    }),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("no port");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

describe("install security", () => {
  it("rejects checksum mismatch", async () => {
    const payload = Buffer.from("#!/bin/sh\necho hi\n");
    const base = await serve({ "/agent.bin": payload });
    const dataDir = mkdtempSync(join(tmpdir(), "ster-sec-"));
    tempDirs.push(dataDir);
    const plan: InstallPlan = {
      id: "p1",
      agentId: "demo",
      version: "1.0.0",
      source: `${base}/agent.bin`,
      verified: true,
      distribution: "binary",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [],
      detail: {
        kind: "binary",
        archive: `${base}/agent.bin`,
        cmd: "./agent",
        args: [],
        env: {},
        sha256: "0".repeat(64),
      },
    };
    await expect(installBinaryAgent({ plan, dataDir })).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "integrity-failed",
    );
  });

  it("rejects archive path traversal", async () => {
    const evil = ustar("../escape.txt", Buffer.from("nope"));
    const gz = gzipSync(evil);
    const dest = mkdtempSync(join(tmpdir(), "ster-trav-"));
    tempDirs.push(dest);
    const archive = join(dest, "evil.tar.gz");
    writeFileSync(archive, gz);
    await expect(extractTarGz(archive, join(dest, "out"))).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "invalid-argument",
    );
  });

  it("rejects cmd outside the install directory rules", () => {
    expect(() => {
      assertSafeBinaryCmd("agent");
    }).toThrow();
    expect(() => {
      assertSafeBinaryCmd("./foo/../bar");
    }).toThrow();
    expect(() => {
      assertSafeBinaryCmd("./agent");
    }).not.toThrow();
  });

  it("rejects non-HTTPS remote URLs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-http-"));
    tempDirs.push(dataDir);
    const plan: InstallPlan = {
      id: "p2",
      agentId: "demo",
      version: "1.0.0",
      source: "http://example.com/agent.bin",
      verified: false,
      distribution: "binary",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [],
      detail: {
        kind: "binary",
        archive: "http://example.com/agent.bin",
        cmd: "./agent",
        args: [],
        env: {},
      },
    };
    await expect(installBinaryAgent({ plan, dataDir })).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "invalid-argument",
    );
  });

  it("extracts .zip binary archives instead of treating them as the launch file", async () => {
    const payload = Buffer.from("#!/bin/sh\necho zip-ok\n");
    const staging = mkdtempSync(join(tmpdir(), "ster-zip-src-"));
    tempDirs.push(staging);
    const member = join(staging, "agent");
    writeFileSync(member, payload, { mode: 0o755 });
    const zipPath = join(staging, "agent.zip");
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Compress-Archive -LiteralPath '${member.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ]);
    } else {
      await execFileAsync("zip", ["-j", zipPath, member]);
    }
    const zipBytes = readFileSync(zipPath);
    const base = await serve({ "/agent.zip": zipBytes });
    const dataDir = mkdtempSync(join(tmpdir(), "ster-zip-"));
    tempDirs.push(dataDir);
    const plan: InstallPlan = {
      id: "p-zip",
      agentId: "zip-demo",
      version: "1.0.0",
      source: `${base}/agent.zip`,
      verified: true,
      distribution: "binary",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [],
      detail: {
        kind: "binary",
        archive: `${base}/agent.zip`,
        cmd: "./agent",
        args: [],
        env: {},
        sha256: sha256(zipBytes),
      },
    };
    const { agent } = await installBinaryAgent({ plan, dataDir });
    expect(readFileSync(agent.launch.command, "utf8")).toBe(payload.toString("utf8"));
    expect(readFileSync(agent.launch.command).subarray(0, 2).toString("utf8")).not.toBe("PK");
  });

  it("detects a tampered launch file before start via hash mismatch", async () => {
    const payload = Buffer.from("#!/bin/sh\necho ok\n");
    const base = await serve({ "/agent.bin": payload });
    const dataDir = mkdtempSync(join(tmpdir(), "ster-tamp-"));
    tempDirs.push(dataDir);
    const plan: InstallPlan = {
      id: "p3",
      agentId: "demo",
      version: "1.0.0",
      source: `${base}/agent.bin`,
      verified: true,
      distribution: "binary",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [],
      detail: {
        kind: "binary",
        archive: `${base}/agent.bin`,
        cmd: "./agent",
        args: [],
        env: {},
        sha256: sha256(payload),
      },
    };
    const { agent } = await installBinaryAgent({ plan, dataDir });
    writeFileSync(agent.launch.command, "#!/bin/sh\necho tampered\n");
    chmodSync(agent.launch.command, 0o755);
    const { assertLaunchIntegrity } = await import("../../src/agents/integrity.js");
    await expect(
      assertLaunchIntegrity(agent.launch.command, agent.install.launchHash),
    ).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "integrity-failed",
    );
  });
});
