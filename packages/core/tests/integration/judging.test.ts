import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import {
  createCore,
  isSterError,
  memoryPolicySource,
  parseBrand,
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJudgingFactory(cwd: string): void {
  mkdirSync(join(cwd, ".ster"), { recursive: true });
  writeFileSync(
    join(cwd, ".ster", "factory.yaml"),
    [
      "version: 1",
      "agents:",
      "  - id: mock-agent",
      "judging:",
      "  scale:",
      "    min: 0",
      "    max: 10",
      "  criteria:",
      "    - id: correctness",
      "      description: Did the agent solve the task correctly?",
      "",
    ].join("\n"),
  );
}

describe("judging", () => {
  it("scores a run in a separate judging record with judge identity", async () => {
    const dataDir = tempDir("ster-judge-data-");
    const cwd = tempDir("ster-judge-cwd-");
    writeJudgingFactory(cwd);
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
    const found = await core.factory.find(cwd);
    expect(found).toBeTruthy();
    if (!found) {
      return;
    }
    await core.factory.trust(cwd, found.contentHash);

    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);

    const score = await core.runs.judge(run.id, { agentId: MOCK_AGENT_ID });
    expect(score.source).toBe("agent");
    expect(score.value).toBe(8);
    expect(score.judge?.agentId).toBe(MOCK_AGENT_ID);
    const judgingRunId = score.judge?.judgingRunId;
    expect(judgingRunId).toBeTruthy();
    if (!judgingRunId) {
      return;
    }

    const detail = await core.runs.get(run.id);
    expect(detail.scores.filter((item) => item.source === "agent")).toHaveLength(1);

    const judging = await core.runs.get(judgingRunId);
    expect(judging.kind).toBe("judging");
    expect(judging.outcome).toBe("completed");
    expect(judging.commands).toEqual([]);
  });

  it("refuses a judging agent blocked by organization policy", async () => {
    const dataDir = tempDir("ster-judge-block-data-");
    const cwd = tempDir("ster-judge-block-cwd-");
    writeJudgingFactory(cwd);

    // Seed a run without agent allow-list restrictions.
    const seed = await createCore({
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
    cores.push(seed);
    await seed.agents.confirmFirstStart(MOCK_AGENT_ID);
    const found = await seed.factory.find(cwd);
    expect(found).toBeTruthy();
    if (!found) {
      return;
    }
    await seed.factory.trust(cwd, found.contentHash);
    const session = await seed.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const run = await seed.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
    await seed.dispose();
    cores.pop();

    const blocked = await createCore({
      dataDir,
      brand,
      policySources: [
        memoryPolicySource(
          "block",
          { version: 1, agents: { allow: ["fixture-agent"], customAllowed: false } },
          "machine",
        ),
      ],
      environment: {
        PATH: process.env["PATH"] ?? "/usr/bin",
        HOME: process.env["HOME"] ?? dataDir,
      },
      includeMockAgent: true,
      mockAgentEntry,
      log: createLogger({ sink: () => undefined }),
    });
    cores.push(blocked);

    await expect(blocked.runs.judge(run.id, { agentId: MOCK_AGENT_ID })).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "blocked-by-policy",
    );
  });
});
