import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, parseBrand, type Core } from "../../src/index.js";
import { createLogger } from "../../src/log.js";
import { openSqliteStore } from "../../src/store/sqlite.js";

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

async function boot(): Promise<{ core: Core; cwd: string; dataDir: string }> {
  const dataDir = tempDir("ster-runs-data-");
  const cwd = tempDir("ster-runs-cwd-");
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
  return { core, cwd, dataDir };
}

describe("run records (SC-019)", () => {
  it("stores exactly one complete record for completed, cancelled, and failed turns", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const completed = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: hello" },
    ]);
    expect(completed.outcome).toBe("completed");
    expect(completed.endedAt).toBeTruthy();

    const longPromise = core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: long" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await core.sessions.cancel(session.id);
    const cancelled = await longPromise;
    expect(cancelled.outcome).toBe("cancelled");

    const failedSession = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const failed = await core.sessions.prompt(failedSession.id, [
      { type: "text", text: "scenario: crash" },
    ]);
    expect(failed.outcome).toBe("failed");

    const listed = await core.runs.list({}, { limit: 50 });
    expect(listed.totals.count).toBeGreaterThanOrEqual(3);
    const byId = new Map(listed.runs.map((run) => [run.id, run]));
    expect(byId.get(completed.id)?.outcome).toBe("completed");
    expect(byId.get(cancelled.id)?.outcome).toBe("cancelled");
    expect(byId.get(failed.id)?.outcome).toBe("failed");

    const storedCompleted = await core.runs.get(completed.id);
    expect(storedCompleted.request).toContain("hello");
    expect(storedCompleted.agent.id).toBe(MOCK_AGENT_ID);
    expect(storedCompleted.permissionMode).toBeTruthy();
  });

  it("marks interrupted open runs on next launch", async () => {
    const first = await boot();
    const session = await first.core.sessions.create({
      agentId: MOCK_AGENT_ID,
      cwd: first.cwd,
    });
    const run = await first.core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: hello" },
    ]);
    await first.core.dispose();
    cores.pop();

    const store = openSqliteStore({ dataDir: first.dataDir });
    const row = store.getSession(session.id);
    expect(row).toBeTruthy();
    if (!row) {
      store.close();
      return;
    }
    store.putSession({
      ...row,
      status: "working",
      payloadJson: JSON.stringify({
        ...JSON.parse(row.payloadJson),
        openRunId: run.id,
      }),
    });
    // Force the run open again for recovery.
    const open = store.getRun(run.id);
    expect(open).toBeTruthy();
    if (!open) {
      store.close();
      return;
    }
    const payload = JSON.parse(open.payloadJson) as { endedAt?: string; outcome?: string };
    delete payload.endedAt;
    delete payload.outcome;
    store.putRun({
      ...open,
      endedAt: null,
      outcome: null,
      payloadJson: JSON.stringify(payload),
    });
    store.close();

    const second = await createCore({
      dataDir: first.dataDir,
      brand,
      policySources: [],
      environment: {
        PATH: process.env["PATH"] ?? "/usr/bin",
        HOME: process.env["HOME"] ?? first.dataDir,
      },
      includeMockAgent: true,
      mockAgentEntry,
      log: createLogger({ sink: () => undefined }),
    });
    cores.push(second);
    await second.agents.confirmFirstStart(MOCK_AGENT_ID);
    const recovered = await second.runs.get(run.id);
    expect(recovered.outcome).toBe("interrupted");
  });

  it("keeps run records without text when a session is deleted that way", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const run = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: hello secret" },
    ]);
    await core.sessions.delete(session.id, { runRecords: "keep-without-text" });
    const kept = await core.runs.get(run.id);
    expect(kept.request).toBeNull();
    expect(kept.outcome).toBe("completed");
  });

  it("filters user ratings and agent scores separately in totals", async () => {
    const { core, cwd } = await boot();
    mkdirSync(join(cwd, ".ster"), { recursive: true });
    writeFileSync(
      join(cwd, ".ster", "factory.yaml"),
      [
        "version: 1",
        "judging:",
        "  scale: { min: 0, max: 10 }",
        "  criteria:",
        "    - id: correctness",
        "      description: Correct",
        "",
      ].join("\n"),
    );
    const lookup = await core.factory.find(cwd);
    expect(lookup).toBeTruthy();
    if (!lookup) {
      return;
    }
    await core.factory.trust(cwd, lookup.contentHash);

    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
    const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
    await core.runs.rate(run.id, { value: 4 });
    await core.runs.judge(run.id, { agentId: MOCK_AGENT_ID });

    const all = await core.runs.list({}, { limit: 20 });
    expect(all.totals.averageUserRating).toBe(4);
    expect(all.totals.averageAgentScore).toBe(8);

    const userOnly = await core.runs.list({ userRatingMin: 4, userRatingMax: 4 }, { limit: 20 });
    expect(userOnly.totals.count).toBeGreaterThanOrEqual(1);
    const agentOnly = await core.runs.list({ agentScoreMin: 8, agentScoreMax: 8 }, { limit: 20 });
    expect(agentOnly.totals.count).toBeGreaterThanOrEqual(1);

    const day = run.startedAt.slice(0, 10);
    const sameDay = await core.runs.list({ from: day, to: day }, { limit: 20 });
    expect(sameDay.runs.some((item) => item.id === run.id)).toBe(true);
  });
});
