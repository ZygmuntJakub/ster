import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, type Core, type CoreEvent, parseBrand } from "../../src/index.js";
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
  const dataDir = mkdtempSync(join(tmpdir(), "ster-act-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-act-cwd-"));
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

describe("actions and plan updates", () => {
  it("merges edit-file tool calls into a completed action with a diff", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const unsubscribe = core.events.subscribe((event: CoreEvent) => {
      if (event.type === "approval.requested") {
        void core.sessions.resolveApproval(event.approval.id, {
          optionId: "allow",
        });
      }
    });

    const run = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: edit-file" },
    ]);
    unsubscribe();
    expect(run.outcome).toBe("completed");

    const items = await core.sessions.items(session.id, { limit: 50 });
    const action = items.find((item) => item.kind === "action");
    expect(action).toBeTruthy();
    const payload = action?.payload as {
      status: string;
      content: Array<{ type: string; path?: string; newText?: string }>;
    };
    expect(payload.status).toBe("completed");
    expect(payload.content.some((c) => c.type === "diff" && c.path?.endsWith("notes.txt"))).toBe(
      true,
    );
    expect(readFileSync(join(cwd, "notes.txt"), "utf8")).toContain("edited by mock agent");
  });

  it("replaces plan entries with the latest update", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: plan" }]);
    expect(run.outcome).toBe("completed");

    const items = await core.sessions.items(session.id, { limit: 50 });
    const plans = items.filter((item) => item.kind === "plan");
    expect(plans).toHaveLength(1);
    const entries = (plans[0]?.payload as { entries: Array<{ status: string; content: string }> })
      .entries;
    expect(entries.some((e) => e.content.includes("Inspect") && e.status === "completed")).toBe(
      true,
    );
    expect(entries.some((e) => e.content.includes("Propose") && e.status === "in_progress")).toBe(
      true,
    );
  });
});
