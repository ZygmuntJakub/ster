import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
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

async function boot(): Promise<{ core: Core; cwd: string }> {
  const dataDir = tempDir("ster-session-data-");
  const cwd = tempDir("ster-session-cwd-");
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

describe("session turn against mock agent", () => {
  it("streams a hello reply and completes the run", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    expect(session.status).toBe("idle");

    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
    expect(run.outcome).toBe("completed");
    expect(run.stopReason).toBe("end_turn");

    const items = await core.sessions.items(session.id, { limit: 50 });
    expect(items.some((item) => item.kind === "user-message")).toBe(true);
    expect(
      items.some(
        (item) =>
          item.kind === "agent-message" &&
          typeof item.payload === "object" &&
          item.payload !== null &&
          "text" in item.payload &&
          (item.payload as { text: string }).text.includes("Hello from the mock agent"),
      ),
    ).toBe(true);
    expect(items.some((item) => item.kind === "agent-thought")).toBe(true);

    const after = await core.sessions.get(session.id);
    expect(after.status).toBe("idle");
  });

  it("cancels a long turn and keeps the partial reply", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const promptPromise = core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: long" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await core.sessions.cancel(session.id);
    const run = await promptPromise;

    expect(run.outcome).toBe("cancelled");
    const items = await core.sessions.items(session.id, { limit: 50 });
    const agentText = items
      .filter((item) => item.kind === "agent-message")
      .map((item) =>
        typeof item.payload === "object" && item.payload && "text" in item.payload
          ? (item.payload as { text: string }).text
          : "",
      )
      .join("");
    expect(agentText.length).toBeGreaterThan(0);
    expect((await core.sessions.get(session.id)).status).toBe("idle");
  });

  it("marks the session failed when the agent crashes, and restart recovers", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: crash" }]);
    expect(run.outcome).toBe("failed");

    await new Promise((resolve) => setTimeout(resolve, 100));
    const failed = await core.sessions.get(session.id);
    expect(failed.status).toBe("failed");

    const restarted = await core.sessions.restart(session.id);
    expect(restarted.status).toBe("idle");
    const hello = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: hello" },
    ]);
    expect(hello.outcome).toBe("completed");
  });

  it("refuses unconfirmed agents", async () => {
    const dataDir = tempDir("ster-unconfirmed-");
    const cwd = tempDir("ster-unconfirmed-cwd-");
    const core = await createCore({
      dataDir,
      brand,
      policySources: [],
      environment: { PATH: "/usr/bin", HOME: dataDir },
      includeMockAgent: true,
      mockAgentEntry,
      log: createLogger({ sink: () => undefined }),
    });
    cores.push(core);

    await expect(core.sessions.create({ agentId: MOCK_AGENT_ID, cwd })).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "agent-not-confirmed",
    );
  });
});
