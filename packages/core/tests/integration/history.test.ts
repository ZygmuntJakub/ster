import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createCore, parseBrand, type Core } from "../../src/index.js";
import { createLogger } from "../../src/log.js";
import { sessionIsResumable } from "../../src/sessions/resume.js";
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

async function boot(dataDir?: string): Promise<{ core: Core; dataDir: string; cwd: string }> {
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), "ster-hist-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-hist-cwd-"));
  if (!tempDirs.includes(dir)) {
    tempDirs.push(dir);
  }
  tempDirs.push(cwd);
  const core = await createCore({
    dataDir: dir,
    brand,
    policySources: [],
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      HOME: process.env["HOME"] ?? dir,
    },
    includeMockAgent: true,
    mockAgentEntry,
    nodeExecutable: process.execPath,
    log: createLogger({ fields: { test: "history" } }),
  });
  cores.push(core);
  await core.agents.confirmFirstStart(MOCK_AGENT_ID);
  return { core, dataDir: dir, cwd };
}

describe("US6 history / sessions", () => {
  it("runs concurrent sessions and lists them with attention metadata", async () => {
    const { core } = await boot();
    const cwdA = mkdtempSync(join(tmpdir(), "ster-hist-a-"));
    const cwdB = mkdtempSync(join(tmpdir(), "ster-hist-b-"));
    tempDirs.push(cwdA, cwdB);

    const a = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd: cwdA });
    const b = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd: cwdB });
    expect(a.id).not.toBe(b.id);

    const list = await core.sessions.list();
    expect(list.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    let approvalId: string | undefined;
    const unsub = core.events.subscribe((event) => {
      if (event.type === "approval.requested" && event.sessionId === a.id) {
        approvalId = event.approval.id;
      }
    });
    const promptPromise = core.sessions.prompt(a.id, [
      { type: "text", text: "scenario: edit-file" },
    ]);
    await expect.poll(() => approvalId !== undefined, { timeout: 10_000 }).toBe(true);
    const listed = await core.sessions.list();
    const card = listed.find((s) => s.id === a.id);
    expect(card?.needsAttention).toBe(true);
    expect(card?.status).toBe("waiting-approval");

    if (approvalId) {
      await core.sessions.resolveApproval(approvalId, { optionId: "allow" });
    }
    await promptPromise;
    unsub();
  });

  it("recovers interrupted sessions on startup and supports resume + delete", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-hist-persist-"));
    tempDirs.push(dataDir);
    const first = await boot(dataDir);
    const session = await first.core.sessions.create({
      agentId: MOCK_AGENT_ID,
      cwd: first.cwd,
    });
    await first.core.sessions.rename(session.id, "History session");
    await first.core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
    const stored = await first.core.sessions.get(session.id);
    expect(stored.supportsResume).toBe(true);

    await first.core.dispose();
    cores.pop();

    // Simulate a crash mid-turn after dispose did not run (force working + openRunId).
    const store = openSqliteStore({ dataDir });
    const row = store.getSession(session.id);
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("missing session row");
    }
    const previousPayload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    store.putSession({
      ...row,
      status: "working",
      payloadJson: JSON.stringify({
        ...previousPayload,
        openRunId: "run-open",
      }),
    });
    store.close();

    const second = await boot(dataDir);
    const listed = await second.core.sessions.list();
    const card = listed.find((s) => s.id === session.id);
    expect(card?.status).toBe("ended");
    expect(card?.resumable).toBe(true);
    expect(card?.title).toBe("History session");

    const checkStore = openSqliteStore({ dataDir });
    const after = checkStore.getSession(session.id);
    expect(after?.status).toBe("ended");
    const payload = JSON.parse(after?.payloadJson ?? "{}") as {
      interruptedRunIds?: string[];
      openRunId?: string;
    };
    expect(payload.openRunId).toBeUndefined();
    expect(payload.interruptedRunIds).toContain("run-open");
    checkStore.close();

    const resumed = await second.core.sessions.resume(session.id);
    expect(resumed.status).toBe("idle");
    await second.core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);

    await second.core.sessions.delete(session.id, { runRecords: "delete" });
    const afterDelete = await second.core.sessions.list();
    expect(afterDelete.some((s) => s.id === session.id)).toBe(false);
  });

  it("marks non-resumable sessions correctly", () => {
    expect(
      sessionIsResumable({
        session: {
          id: "s",
          agentId: "a",
          agentVersion: "0",
          cwd: "/tmp",
          title: "t",
          status: "ended",
          permissionMode: "always-ask",
          createdAt: "",
          lastActivityAt: "",
          agentSessionId: "agent-1",
        },
        live: false,
        supportsResume: false,
        supportsLoad: false,
      }),
    ).toBe(false);
  });
});
