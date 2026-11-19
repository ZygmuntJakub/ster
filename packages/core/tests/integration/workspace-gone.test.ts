import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, type Core, type CoreEvent, parseBrand } from "../../src/index.js";
import { createLogger } from "../../src/log.js";
import { checkWorkspaceAvailable } from "../../src/workspace/availability.js";

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
  const dataDir = tempDir("ster-gone-data-");
  const cwd = tempDir("ster-gone-cwd-");
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

describe("workspace availability", () => {
  it("detects a deleted working folder", () => {
    const cwd = tempDir("ster-gone-check-");
    expect(checkWorkspaceAvailable(cwd).ok).toBe(true);
    rmSync(cwd, { recursive: true, force: true });
    const result = checkWorkspaceAvailable(cwd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it(
    "fails the session when the working folder disappears before a prompt",
    { timeout: 20_000 },
    async () => {
      const { core, cwd } = await boot();
      const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
      expect(session.status).toBe("idle");

      rmSync(cwd, { recursive: true, force: true });

      await expect(
        core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]),
      ).rejects.toBeTruthy();

      const after = await core.sessions.get(session.id);
      expect(after.status).toBe("failed");
      expect(after.failureReason).toMatch(/Working folder/i);
    },
  );

  it(
    "rejects outside-workspace writes when the client guard is denied",
    { timeout: 20_000 },
    async () => {
      const { core, cwd } = await boot();
      const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

      const unsubscribe = core.events.subscribe((event: CoreEvent) => {
        if (event.type !== "approval.requested" || event.sessionId !== session.id) {
          return;
        }
        if (event.approval.source === "client-guard") {
          void core.sessions.resolveApproval(event.approval.id, { optionId: "reject" });
          return;
        }
        void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
      });

      const run = await core.sessions.prompt(session.id, [
        { type: "text", text: "scenario: escape-workspace" },
      ]);
      unsubscribe();
      expect(run.outcome).toBe("completed");

      const items = await core.sessions.items(session.id, { limit: 50 });
      const texts = items
        .filter((item) => item.kind === "agent-message")
        .map((item) => {
          if (
            typeof item.payload === "object" &&
            item.payload !== null &&
            "text" in item.payload &&
            typeof item.payload.text === "string"
          ) {
            return item.payload.text;
          }
          return "";
        });
      expect(texts.some((text) => /outside-workspace|Write failed|outside/i.test(text))).toBe(true);
    },
  );
});
