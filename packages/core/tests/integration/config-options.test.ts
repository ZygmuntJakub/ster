import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, parseBrand, type Core } from "../../src/index.js";
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

async function boot(): Promise<{ core: Core; cwd: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), "ster-config-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-config-cwd-"));
  tempDirs.push(dataDir, cwd);
  const core = await createCore({
    dataDir,
    brand,
    policySources: [],
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin",
      HOME: process.env["HOME"] ?? dataDir,
    },
    includeMockAgent: true,
    mockAgentEntry,
    log: createLogger({ sink: () => undefined }),
  });
  cores.push(core);
  await core.agents.confirmFirstStart(MOCK_AGENT_ID);
  return { core, cwd };
}

describe("config options and commands against mock agent", () => {
  it("captures configOptions from session/new and applies setConfigOption", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    expect(session.configOptions?.some((o) => o.category === "model")).toBe(true);
    expect(session.configOptions?.some((o) => o.category === "mode")).toBe(true);

    await core.sessions.setConfigOption(session.id, "model", "mock-large");
    const after = await core.sessions.get(session.id);
    const model = after.configOptions?.find((o) => o.id === "model");
    expect(model?.currentValue).toBe("mock-large");
  });

  it("applies agent-initiated config_option_update and current_mode_update", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: config-options" }]);
    const after = await core.sessions.get(session.id);
    const model = after.configOptions?.find((o) => o.id === "model");
    const mode = after.configOptions?.find((o) => o.category === "mode");
    expect(model?.currentValue).toBe("mock-large");
    expect(mode?.currentValue).toBe("code");
  });

  it("stores available_commands_update", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: commands" }]);
    const after = await core.sessions.get(session.id);
    expect(after.availableCommands?.map((c) => c.name)).toEqual(["status", "reset"]);
    expect(after.availableCommands?.[1]?.inputHint).toBe("optional note");
  });

  it("falls back to legacy modes + set_mode when mock advertises modes only", async () => {
    const { core, cwd } = await boot();
    const agent = await core.agents.saveCustom({
      id: "custom:legacy-modes",
      name: "Legacy Modes Mock",
      command: process.execPath,
      args: ["--import", "tsx", mockAgentEntry],
      env: {
        NODE_NO_WARNINGS: "1",
        STER_MOCK_LEGACY_MODES: "1",
      },
    });
    await core.agents.confirmFirstStart(agent.id);

    const session = await core.sessions.create({ agentId: agent.id, cwd });
    const mode = session.configOptions?.find((o) => o.id === "mode");
    expect(mode?.legacyMode).toBe(true);
    expect(mode?.currentValue).toBe("code");
    expect(session.configOptions?.some((o) => o.category === "model")).toBe(false);

    await core.sessions.setConfigOption(session.id, "mode", "ask");
    const after = await core.sessions.get(session.id);
    expect(after.configOptions?.find((o) => o.id === "mode")?.currentValue).toBe("ask");
  });
});
