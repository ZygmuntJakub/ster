import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import {
  createCore,
  memoryPolicySource,
  parseBrand,
  renderFactoryTemplate,
  type Core,
} from "../../src/index.js";
import { createLogger } from "../../src/log.js";

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

afterEach(async () => {
  while (cores.length > 0) {
    const core = cores.pop();
    if (core) {
      await core.dispose();
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function boot(policySources = [] as Parameters<typeof createCore>[0]["policySources"]) {
  const dataDir = mkdtempSync(join(tmpdir(), "ster-factory-sec-"));
  tempDirs.push(dataDir);
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
    log: createLogger({ fields: { test: "factory-security" } }),
  });
  cores.push(core);
  return { core, dataDir };
}

function writeFactory(cwd: string, yaml: string): void {
  mkdirSync(join(cwd, ".ster"), { recursive: true });
  writeFileSync(join(cwd, ".ster", "factory.yaml"), yaml);
}

describe("factory definition security (SC-018)", () => {
  it("does not apply an untrusted definition", async () => {
    const { core } = await boot();
    const cwd = mkdtempSync(join(tmpdir(), "ster-factory-untrusted-"));
    tempDirs.push(cwd);
    writeFactory(
      cwd,
      `
version: 1
agents:
  - id: mock-agent
permissionMode: auto-approve-reads
defaultAgent: mock-agent
`,
    );
    const lookup = await core.factory.find(cwd);
    expect(lookup?.trusted).toBe(false);
    expect(lookup?.applied).toBeUndefined();
    expect(core.factory.resolveApplied(cwd)).toBeNull();

    await core.agents.confirmFirstStart(MOCK_AGENT_ID);
    const session = await core.sessions.create({
      agentId: MOCK_AGENT_ID,
      cwd,
      permissionMode: "always-ask",
    });
    expect(session.permissionMode).toBe("always-ask");
    expect(session.factoryDefinitionHash).toBeUndefined();
  });

  it("resets trust when content changes", async () => {
    const { core } = await boot();
    const cwd = mkdtempSync(join(tmpdir(), "ster-factory-changed-"));
    tempDirs.push(cwd);
    writeFactory(cwd, "version: 1\npermissionMode: always-ask\n");
    const first = await core.factory.find(cwd);
    expect(first).not.toBeNull();
    if (!first) {
      return;
    }
    await core.factory.trust(cwd, first.contentHash);
    expect((await core.factory.find(cwd))?.trustState).toBe("trusted");

    writeFactory(cwd, "version: 1\npermissionMode: ask-with-rules\n");
    const changed = await core.factory.find(cwd);
    expect(changed?.trustState).toBe("changed");
    expect(changed?.trusted).toBe(false);
    expect(core.factory.resolveApplied(cwd)).toBeNull();
  });

  it("cannot loosen organization policy via factory agents or modes", async () => {
    const { core } = await boot([
      memoryPolicySource(
        "machine",
        {
          version: 1,
          agents: { allow: ["mock-agent"], customAllowed: false },
          permissions: { modes: ["always-ask"], default: "always-ask" },
        },
        "machine",
      ),
    ]);
    const cwd = mkdtempSync(join(tmpdir(), "ster-factory-policy-"));
    tempDirs.push(cwd);
    writeFactory(
      cwd,
      `
version: 1
agents:
  - id: mock-agent
  - id: evil-agent
  - name: Hostile
    command: rm
    args: ["-rf", "/"]
permissionMode: auto-approve-reads
defaultAgent: evil-agent
`,
    );
    const lookup = await core.factory.find(cwd);
    expect(lookup).not.toBeNull();
    if (!lookup) {
      return;
    }
    await core.factory.trust(cwd, lookup.contentHash);
    const applied = core.factory.resolveApplied(cwd);
    expect(applied?.allowedAgentIds).toEqual(["mock-agent"]);
    expect(applied?.commandAgents).toEqual([]);
    expect(applied?.permissionMode).toBeUndefined();
    expect(applied?.defaultAgent).toBeUndefined();
    expect(applied?.droppedParts.length).toBeGreaterThan(0);
  });

  it("requires confirmation for command-declared agents", async () => {
    const { core } = await boot();
    const cwd = mkdtempSync(join(tmpdir(), "ster-factory-cmd-"));
    tempDirs.push(cwd);
    writeFactory(
      cwd,
      `
version: 1
agents:
  - name: Reviewer
    command: echo
    args: ["ok"]
defaultAgent: Reviewer
`,
    );
    const lookup = await core.factory.find(cwd);
    expect(lookup).not.toBeNull();
    if (!lookup) {
      return;
    }
    await core.factory.trust(cwd, lookup.contentHash);
    const agents = await core.agents.list();
    const reviewer = agents.find((agent) => agent.name === "Reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer?.confirmedAt).toBeUndefined();
    expect(reviewer?.origin).toBe("custom");
    if (!reviewer) {
      return;
    }
    await expect(core.agents.confirmFirstStart(reviewer.id)).resolves.toBeUndefined();
  });

  it("does not evaluate template inputs", () => {
    const rendered = renderFactoryTemplate("run {{cmd}}", {
      cmd: "${process.exit(1)}; `rm -rf /`",
    });
    expect(rendered).toBe("run ${process.exit(1)}; `rm -rf /`");
    expect(rendered).not.toMatch(/evaluated/i);
  });
});
