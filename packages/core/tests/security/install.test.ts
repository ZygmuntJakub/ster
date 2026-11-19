import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { crc32, gzipSync } from "node:zlib";
import { installBinaryAgent } from "../../src/agents/install-binary.js";
import { assertSafeBinaryCmd } from "../../src/agents/integrity.js";
import { extractTarGz } from "../../src/agents/extract.js";
import { isSterError } from "../../src/errors.js";
import type { InstallPlan } from "../../src/agents/plan.js";

/** Minimal store-method ZIP (no shell) so Windows CI avoids PowerShell cold start. */
function storeZip(entries: ReadonlyArray<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data) >>> 0;
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, end]);
}

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
    const zipBytes = storeZip([{ name: "agent", data: payload }]);
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
