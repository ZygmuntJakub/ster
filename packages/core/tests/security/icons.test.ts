import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchAgentIcon } from "../../src/agents/icons.js";

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

async function listen(
  handler: (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => void,
): Promise<string> {
  const server = createServer(handler);
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

describe("agent icons security", () => {
  it("only loads icons from the registry origin and rejects oversized payloads", async () => {
    const registryBase = await listen((req, res) => {
      if (req.url === "/icon.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const otherBase = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end("<svg></svg>");
    });

    const dataDir = mkdtempSync(join(tmpdir(), "ster-icons-"));
    tempDirs.push(dataDir);

    const ok = await fetchAgentIcon({
      dataDir,
      registryUrl: `${registryBase}/registry.json`,
      agentId: "a",
      icon: `${registryBase}/icon.svg`,
    });
    expect(ok?.mimeType).toContain("image/svg");

    const cross = await fetchAgentIcon({
      dataDir,
      registryUrl: `${registryBase}/registry.json`,
      agentId: "a",
      icon: `${otherBase}/icon.svg`,
    });
    expect(cross).toBeNull();

    const hugeBase = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.alloc(300 * 1024, 1));
    });
    const huge = await fetchAgentIcon({
      dataDir,
      registryUrl: `${hugeBase}/registry.json`,
      agentId: "a",
      icon: `${hugeBase}/big.bin`,
    });
    expect(huge).toBeNull();
  });
});
