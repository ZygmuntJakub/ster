import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, parseBrand, type Core, type CoreEvent } from "../../src/index.js";
import { createLogger } from "../../src/log.js";
import { createCommandRunner, stripControlSequences } from "../../src/workspace/commands.js";

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
  const dataDir = mkdtempSync(join(tmpdir(), "ster-cmd-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-cmd-cwd-"));
  tempDirs.push(dataDir, cwd);
  const core = await createCore({
    dataDir,
    brand,
    policySources: [],
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      HOME: process.env["HOME"] ?? dataDir,
    },
    includeMockAgent: true,
    mockAgentEntry,
    nodeExecutable: process.execPath,
    log: createLogger({ fields: { test: "commands" } }),
  });
  cores.push(core);
  await core.agents.confirmFirstStart(MOCK_AGENT_ID);
  return { core, cwd };
}

describe("stripControlSequences", () => {
  it("removes CSI sequences", () => {
    expect(stripControlSequences("hello\u001b[31mred\u001b[0m")).toBe("hellored");
  });
});

describe("command runner", () => {
  it("captures output, truncates to the byte limit, waits, kills, and releases", async () => {
    const outputs: string[] = [];
    const runner = createCommandRunner({
      sessionId: "s1",
      environment: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
      onOutput: (_run, chunk) => {
        outputs.push(chunk);
      },
    });

    const run = runner.start({
      command: "printf",
      args: ["abcdefghij"],
      cwd: tmpdir(),
      runId: "r1",
      outputByteLimit: 4,
    });
    expect(run.state).toBe("running");

    const exit = await runner.waitForExit(run.terminalId);
    expect(exit.exitCode).toBe(0);
    const snapshot = runner.output(run.terminalId);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.output.length).toBeLessThanOrEqual(4);
    expect(outputs.join("")).toContain("a");

    await runner.release(run.terminalId);
    expect(runner.get(run.terminalId)).toBeUndefined();

    const long = runner.start({
      command: "sleep",
      args: ["5"],
      cwd: tmpdir(),
      runId: "r2",
    });
    await runner.kill(long.terminalId);
    const killed = await runner.waitForExit(long.terminalId);
    expect(killed.signal != null || killed.exitCode !== 0).toBe(true);
    await runner.release(long.terminalId);
  });
});

describe("terminal/* via mock agent", () => {
  it("runs printf, streams output events, and cleans up on session end", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const events: CoreEvent[] = [];
    const unsubscribe = core.events.subscribe((event) => {
      if (event.type.startsWith("command.")) {
        events.push(event);
      }
      if (event.type === "approval.requested" && event.sessionId === session.id) {
        void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
      }
    });

    const run = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: run-command" },
    ]);
    expect(run.outcome).toBe("completed");

    expect(events.some((e) => e.type === "command.started")).toBe(true);
    expect(events.some((e) => e.type === "command.output")).toBe(true);
    expect(events.some((e) => e.type === "command.exited")).toBe(true);
    const output = events
      .filter((e) => e.type === "command.output")
      .map((e) => ("data" in e ? (e.data ?? "") : ""))
      .join("");
    expect(output).toContain("hello-from-command");

    unsubscribe();
    await core.sessions.end(session.id);
  });

  it("kills a long-running command via killCommand", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    let commandRunId: string | undefined;
    const unsubscribe = core.events.subscribe((event) => {
      if (event.type === "approval.requested" && event.sessionId === session.id) {
        void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
      }
      if (event.type === "command.started" && event.sessionId === session.id) {
        commandRunId = event.commandRunId;
        void core.sessions.killCommand(event.commandRunId);
      }
    });

    const finished = core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: run-long" },
    ]);

    await expect.poll(() => commandRunId !== undefined, { timeout: 15_000 }).toBe(true);
    const result = await finished;
    expect(["completed", "cancelled", "failed"]).toContain(result.outcome ?? "");
    unsubscribe();
    await core.sessions.end(session.id);
  });
});
