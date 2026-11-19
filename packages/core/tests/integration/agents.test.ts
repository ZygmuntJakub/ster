import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentService } from "../../src/agents/service.js";
import { createLogger } from "../../src/log.js";
import { createSettingsService } from "../../src/settings/service.js";
import { openSqliteStore } from "../../src/store/sqlite.js";
import { createEventStream } from "../../src/events/stream.js";
import { resolvePlatformKey } from "../../src/agents/platform.js";

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

async function serveMutable(files: Record<string, string | Buffer>): Promise<string> {
  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";
    const body = files[path];
    if (body === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    res.writeHead(200, {
      "content-type": path.endsWith(".json") ? "application/json" : "application/octet-stream",
      etag: `"${sha256(buf).slice(0, 16)}"`,
    });
    res.end(buf);
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

describe("agents install integration", () => {
  it("refreshes a fixture registry, installs, updates, and removes a binary agent", async () => {
    const platformKey = resolvePlatformKey();
    const binary = Buffer.from("#!/bin/sh\necho fixture-agent\n");
    const v2Binary = Buffer.from("#!/bin/sh\necho fixture-agent-v2\n");
    const files: Record<string, string | Buffer> = {
      "/agent.bin": binary,
      "/agent-v2.bin": v2Binary,
    };
    const base = await serveMutable(files);

    const registry = {
      version: "1.0.0",
      agents: [
        {
          id: "fixture-agent",
          name: "Fixture Agent",
          version: "1.0.0",
          distribution: {
            binary: {
              [platformKey]: {
                archive: `${base}/agent.bin`,
                cmd: "./agent",
                sha256: sha256(binary),
              },
            },
          },
        },
      ],
    };
    files["/registry.json"] = JSON.stringify(registry);

    const dataDir = mkdtempSync(join(tmpdir(), "ster-agents-int-"));
    tempDirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    const settings = createSettingsService({ store });
    const events = createEventStream();
    const agents = createAgentService({
      store,
      settings,
      log: createLogger({ sink: () => undefined }),
      environment: { PATH: "/usr/bin", HOME: dataDir },
      events,
      registryUrl: `${base}/registry.json`,
      includeMockAgent: false,
    });

    const status = await agents.refreshRegistry({ force: true });
    expect(status.reachable).toBe(true);

    const listed = await agents.list();
    expect(listed.find((a) => a.id === "fixture-agent")?.readiness).toBe("not-installed");

    const plan = await agents.planInstall("fixture-agent");
    expect(plan.verified).toBe(true);
    const installed = await agents.install(plan);
    expect(installed.readiness).toBe("ready");
    expect(installed.install?.path).toContain("fixture-agent");

    const agentEntry = registry.agents[0];
    if (!agentEntry) {
      throw new Error("missing registry agent");
    }
    agentEntry.version = "2.0.0";
    agentEntry.distribution.binary[platformKey] = {
      archive: `${base}/agent-v2.bin`,
      cmd: "./agent",
      sha256: sha256(v2Binary),
    };
    files["/registry.json"] = JSON.stringify(registry);
    await agents.refreshRegistry({ force: true });
    const afterRefresh = await agents.list();
    expect(afterRefresh.find((a) => a.id === "fixture-agent")?.readiness).toBe("update-available");

    const updatePlan = await agents.planInstall("fixture-agent");
    expect(updatePlan.version).toBe("2.0.0");
    const updated = await agents.install(updatePlan);
    expect(updated.version).toBe("2.0.0");

    await agents.remove("fixture-agent");
    const afterRemove = await agents.list();
    expect(afterRemove.find((a) => a.id === "fixture-agent")?.readiness).toBe("not-installed");

    store.close();
  });
});
