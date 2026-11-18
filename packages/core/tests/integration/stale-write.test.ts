import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import {
  createCore,
  type ApprovalRequest,
  type Core,
  type CoreEvent,
  parseBrand,
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function boot(): Promise<{ core: Core; cwd: string }> {
  const dataDir = tempDir("ster-stale-data-");
  const cwd = tempDir("ster-stale-cwd-");
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

function autoResolveApprovals(
  core: Core,
  sessionId: string,
  decide: (approval: ApprovalRequest) => { optionId: string } | { cancelled: true },
): () => void {
  return core.events.subscribe((event: CoreEvent) => {
    if (event.type !== "approval.requested" || event.sessionId !== sessionId) {
      return;
    }
    void core.sessions.resolveApproval(event.approval.id, decide(event.approval));
  });
}

describe("stale-write guard", () => {
  it(
    "prompts before overwriting a file changed after the last snapshot",
    { timeout: 20_000 },
    async () => {
      const { core, cwd } = await boot();
      const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

      const staleApprovals: ApprovalRequest[] = [];
      const unsubscribe = autoResolveApprovals(core, session.id, (approval) => {
        if (approval.source === "client-guard") {
          staleApprovals.push(approval);
          return { optionId: "reject" };
        }
        return { optionId: "allow" };
      });

      // Seed a snapshot via an initial agent write.
      const first = core.sessions.prompt(session.id, [
        { type: "text", text: "scenario: write-after-external-edit" },
      ]);

      // Wait until race.txt exists from the first write, then mutate it externally.
      const racePath = join(cwd, "race.txt");
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          if (readFileSync(racePath, "utf8").includes("version-1")) {
            break;
          }
        } catch {
          // not yet
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      writeFileSync(racePath, "external-edit\n", "utf8");

      const run = await first;
      unsubscribe();
      expect(run.outcome).toBe("completed");
      expect(staleApprovals.length).toBeGreaterThanOrEqual(1);
      expect(staleApprovals[0]?.source).toBe("client-guard");
      expect(readFileSync(racePath, "utf8")).toBe("external-edit\n");
    },
  );

  it("overwrites after the user allows a stale-write guard", { timeout: 20_000 }, async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const unsubscribe = autoResolveApprovals(core, session.id, () => ({ optionId: "allow" }));

    const first = core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: write-after-external-edit" },
    ]);

    const racePath = join(cwd, "race.txt");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        if (readFileSync(racePath, "utf8").includes("version-1")) {
          break;
        }
      } catch {
        // not yet
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    writeFileSync(racePath, "external-edit\n", "utf8");

    const run = await first;
    unsubscribe();
    expect(run.outcome).toBe("completed");
    expect(readFileSync(racePath, "utf8")).toBe("version-2-from-agent\n");
  });
});
