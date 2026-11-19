import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createCore, isSterError, parseBrand, type Core } from "../../src/index.js";
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function bootAuthAgent(): Promise<{ core: Core; cwd: string; agentId: string }> {
  const dataDir = tempDir("ster-auth-data-");
  const cwd = tempDir("ster-auth-cwd-");
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

  const agent = await core.agents.saveCustom({
    id: "custom:auth-mock",
    name: "Auth Mock",
    command: process.execPath,
    args: ["--import", "tsx", mockAgentEntry],
    env: {
      NODE_NO_WARNINGS: "1",
      STER_MOCK_AUTH_REQUIRED: "1",
    },
  });
  await core.agents.confirmFirstStart(agent.id);
  return { core, cwd, agentId: agent.id };
}

describe("login-required auth against mock agent", () => {
  it("creates a needs-login session and completes agent-type authenticate", async () => {
    const { core, cwd, agentId } = await bootAuthAgent();
    const session = await core.sessions.create({ agentId, cwd });
    expect(session.status).toBe("needs-login");

    const methods = await core.sessions.authMethods(session.id);
    expect(methods.some((m) => m.id === "mock-agent-login" && m.type === "agent")).toBe(true);
    expect(methods.some((m) => m.id === "mock-terminal-login" && m.type === "terminal")).toBe(true);

    await expect(
      core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]),
    ).rejects.toSatisfy((error: unknown) => isSterError(error) && error.code === "login-required");

    await core.sessions.authenticate(session.id, "mock-agent-login");
    const after = await core.sessions.get(session.id);
    expect(after.status).toBe("idle");

    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
    expect(run.outcome).toBe("completed");
  });

  it("describes terminal login and refuses authenticate for terminal methods", async () => {
    const { core, cwd, agentId } = await bootAuthAgent();
    const session = await core.sessions.create({ agentId, cwd });
    expect(session.status).toBe("needs-login");

    const plan = await core.sessions.describeTerminalLogin(session.id, "mock-terminal-login");
    expect(plan.methodId).toBe("mock-terminal-login");
    expect(plan.args).toContain("--mock-login");
    expect(plan.command).toBe(process.execPath);

    await expect(core.sessions.authenticate(session.id, "mock-terminal-login")).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "invalid-argument",
    );
  });
});
