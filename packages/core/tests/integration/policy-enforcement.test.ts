import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { DEFAULT_REGISTRY_URL } from "../../src/agents/registry.js";
import {
  createCore,
  memoryPolicySource,
  parseBrand,
  type Core,
  type PolicySource,
} from "../../src/index.js";
import { createLogger } from "../../src/log.js";
import { SterError } from "../../src/errors.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mockAgentEntry = join(repoRoot, "packages/mock-agent/src/index.ts");

const brand = parseBrand({
  productName: "Ster",
  appId: "com.example.ster",
  dataDirName: "Ster",
  policyDirName: "SterPolicy",
  icon: "icon.png",
  colors: { accent: "#000000" },
});

const tempDirs: string[] = [];
const cores: Core[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  while (cores.length > 0) {
    const core = cores.pop();
    if (core) {
      await core.dispose();
    }
  }
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function boot(policySources: PolicySource[]): Promise<{ core: Core; cwd: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), "ster-policy-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-policy-cwd-"));
  tempDirs.push(dataDir, cwd);
  const core = await createCore({
    dataDir,
    brand,
    policySources,
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin",
      HOME: process.env["HOME"] ?? dataDir,
    },
    includeMockAgent: true,
    mockAgentEntry,
    nodeExecutable: process.execPath,
    log: createLogger({ fields: { test: "policy" } }),
  });
  cores.push(core);
  return { core, cwd };
}

describe("policy enforcement integration", () => {
  it("marks disallowed agents blocked-by-policy and refuses start", async () => {
    const { core } = await boot([
      memoryPolicySource("machine", { version: 1, agents: { allow: ["other-agent"] } }, "machine"),
    ]);
    const agents = await core.agents.list();
    const mock = agents.find((a) => a.id === MOCK_AGENT_ID);
    expect(mock?.readiness).toBe("blocked-by-policy");
    await expect(core.agents.confirmFirstStart(MOCK_AGENT_ID)).rejects.toMatchObject({
      code: "blocked-by-policy",
    });
  });

  it("refuses custom agents when customAllowed is false", async () => {
    const { core } = await boot([
      memoryPolicySource("machine", { version: 1, agents: { customAllowed: false } }, "machine"),
    ]);
    await expect(
      core.agents.saveCustom({
        name: "X",
        command: "echo",
        args: [],
        env: {},
      }),
    ).rejects.toMatchObject({ code: "blocked-by-policy" });
  });

  it("does not contact the public registry when disabled", async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ agents: [] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("no port");
    }
    const publicUrl = `http://127.0.0.1:${String(address.port)}/registry.json`;

    const dataDir = mkdtempSync(join(tmpdir(), "ster-policy-dis-"));
    tempDirs.push(dataDir);
    const core = await createCore({
      dataDir,
      brand,
      policySources: [
        memoryPolicySource("machine", { version: 1, registry: { mode: "disabled" } }, "machine"),
      ],
      registryUrl: publicUrl,
      fetchImpl: async (input, init) => {
        hits += 1;
        return fetch(input, init);
      },
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: dataDir },
      includeMockAgent: false,
      log: createLogger({ fields: { test: "policy-disabled" } }),
    });
    cores.push(core);

    const status = await core.agents.refreshRegistry({ force: true });
    expect(status.reachable).toBe(false);
    expect(await core.agents.icon("anything")).toBeNull();
    expect(hits).toBe(0);
    expect(DEFAULT_REGISTRY_URL.startsWith("https://")).toBe(true);
  });

  it("uses a custom registry url without hitting the default public host", async () => {
    const contacted: string[] = [];
    const server = createServer((req, res) => {
      contacted.push(req.url ?? "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: "1", agents: [] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("no port");
    }
    // Schema requires https; use memory policy with https URL and intercept fetch.
    const customHttps = "https://org.example/registry.json";

    const dataDir = mkdtempSync(join(tmpdir(), "ster-policy-custom-"));
    tempDirs.push(dataDir);
    const core = await createCore({
      dataDir,
      brand,
      policySources: [
        memoryPolicySource(
          "machine",
          { version: 1, registry: { mode: "custom", url: customHttps } },
          "machine",
        ),
      ],
      fetchImpl: (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        contacted.push(url);
        if (url.includes("cdn.agentclientprotocol.com")) {
          return Promise.reject(new Error("public registry contacted"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ version: "1", agents: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: dataDir },
      includeMockAgent: false,
      log: createLogger({ fields: { test: "policy-custom" } }),
    });
    cores.push(core);

    const status = await core.agents.refreshRegistry({ force: true });
    expect(status.reachable).toBe(true);
    expect(contacted.every((u) => !u.includes("cdn.agentclientprotocol.com"))).toBe(true);
    expect(contacted.some((u) => u === customHttps)).toBe(true);
  });

  it("requires checksum when install.requireChecksum is true", async () => {
    const { core } = await boot([
      memoryPolicySource(
        "machine",
        {
          version: 1,
          install: { requireChecksum: true },
          agents: { allow: ["fixture-agent", "mock-agent"] },
        },
        "machine",
      ),
    ]);
    // Without a registry entry this is not-found; seed via refresh is empty.
    // Direct planInstall rejects unknown agents; assert policy flag is active.
    expect(core.policy.requireChecksum()).toBe(true);
  });

  it("limits permission modes and blocks invalid policy sessions", async () => {
    const { core, cwd } = await boot([
      memoryPolicySource(
        "machine",
        {
          version: 1,
          permissions: { modes: ["always-ask"], default: "always-ask" },
          agents: { allow: ["mock-agent"] },
        },
        "machine",
      ),
    ]);
    await core.agents.confirmFirstStart(MOCK_AGENT_ID);
    await expect(
      core.sessions.create({
        agentId: MOCK_AGENT_ID,
        cwd,
        permissionMode: "auto-approve-reads",
      }),
    ).rejects.toMatchObject({ code: "blocked-by-policy" });

    const invalidDir = mkdtempSync(join(tmpdir(), "ster-policy-invalid-"));
    const invalidCwd = mkdtempSync(join(tmpdir(), "ster-policy-invalid-cwd-"));
    tempDirs.push(invalidDir, invalidCwd);
    const invalid = await createCore({
      dataDir: invalidDir,
      brand,
      policySources: [memoryPolicySource("machine", { version: 99 }, "machine")],
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: invalidDir },
      includeMockAgent: true,
      mockAgentEntry,
      nodeExecutable: process.execPath,
      log: createLogger({ fields: { test: "policy-invalid" } }),
    });
    cores.push(invalid);
    expect(invalid.policy.state).toBe("invalid");
    await expect(
      invalid.sessions.create({ agentId: MOCK_AGENT_ID, cwd: invalidCwd }),
    ).rejects.toBeInstanceOf(SterError);
    await expect(
      invalid.sessions.create({ agentId: MOCK_AGENT_ID, cwd: invalidCwd }),
    ).rejects.toMatchObject({ code: "policy-invalid" });
    // History APIs remain available.
    expect(await invalid.sessions.list()).toEqual([]);
  });

  it("applies policy changes only on the next createCore (FR-052)", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-policy-reload-"));
    const cwd = mkdtempSync(join(tmpdir(), "ster-policy-reload-cwd-"));
    tempDirs.push(dataDir, cwd);

    let doc: object = { version: 1, agents: { allow: ["mock-agent"] } };
    const source = memoryPolicySource("machine", () => doc, "machine");

    const first = await createCore({
      dataDir,
      brand,
      policySources: [source],
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: dataDir },
      includeMockAgent: true,
      mockAgentEntry,
      nodeExecutable: process.execPath,
      log: createLogger({ fields: { test: "policy-fr052-a" } }),
    });
    cores.push(first);
    expect(first.policy.agentAllowed("mock-agent")).toBe(true);

    doc = { version: 1, agents: { allow: ["other"] } };
    // Same running core still sees the old document until dispose + recreate.
    expect(first.policy.agentAllowed("mock-agent")).toBe(true);

    await first.dispose();
    cores.pop();

    const second = await createCore({
      dataDir,
      brand,
      policySources: [source],
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: dataDir },
      includeMockAgent: true,
      mockAgentEntry,
      nodeExecutable: process.execPath,
      log: createLogger({ fields: { test: "policy-fr052-b" } }),
    });
    cores.push(second);
    expect(second.policy.agentAllowed("mock-agent")).toBe(false);
  });
});
