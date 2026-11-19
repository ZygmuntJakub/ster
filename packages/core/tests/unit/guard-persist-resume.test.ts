import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFsPath,
  createExecuteApprovalTracker,
  isExecuteToolSubject,
  readAbsoluteTextFile,
  writeAbsoluteTextFile,
} from "../../src/permissions/guard.js";
import { rowToRun, rowToScore, runToRow, scoreToRow } from "../../src/runs/persist.js";
import { createUserRating } from "../../src/runs/scores.js";
import { finalizeRun, startRun } from "../../src/runs/lifecycle.js";
import {
  reattachAgentSession,
  resolveResumeMode,
  sessionIsResumable,
} from "../../src/sessions/resume.js";
import type { Session } from "../../src/sessions/session.js";
import { isSterError } from "../../src/errors.js";
import type { RunRow, ScoreRow } from "../../src/store/store.js";
import type { AcpConnection } from "../../src/acp/connection.js";
import type { RunRecord, RunScore } from "../../src/runs/lifecycle.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sampleSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    title: "t",
    agentId: "mock-agent",
    agentVersion: "1.0.0",
    cwd: "/tmp/project",
    status: "idle",
    permissionMode: "always-ask",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    agentSessionId: "agent-sess-1",
    ...overrides,
  };
}

describe("permissions/guard", () => {
  it("classifies inside and outside paths without throwing", () => {
    const cwd = tempDir("ster-guard-");
    writeFileSync(join(cwd, "inside.txt"), "ok\n", "utf8");
    expect(classifyFsPath(cwd, "inside.txt").status).toBe("inside");
    const outside = classifyFsPath(cwd, "../escape.txt");
    expect(outside.status).toBe("outside");
    if (outside.status === "outside") {
      expect(outside.absolutePath.length).toBeGreaterThan(0);
    }
  });

  it("reads and writes absolute text files with line/limit slicing", () => {
    const cwd = tempDir("ster-guard-abs-");
    const nested = join(cwd, "nested", "file.txt");
    const written = writeAbsoluteTextFile(nested, "a\nb\nc\nd\n");
    expect(written.resolvedPath.length).toBeGreaterThan(0);
    const sliced = readAbsoluteTextFile(nested, { line: 2, limit: 2 });
    expect(sliced.content).toBe("b\nc");
    expect(() => readAbsoluteTextFile(join(cwd, "missing.txt"))).toThrow(/not found/iu);
  });

  it("tracks execute approvals and recognizes execute subjects", () => {
    const tracker = createExecuteApprovalTracker();
    expect(tracker.consumeExecuteAllow("s1")).toBe(false);
    tracker.noteExecuteAllow("s1");
    tracker.noteExecuteAllow("s1");
    expect(tracker.consumeExecuteAllow("s1")).toBe(true);
    expect(tracker.consumeExecuteAllow("s1")).toBe(true);
    expect(tracker.consumeExecuteAllow("s1")).toBe(false);
    tracker.noteExecuteAllow("s2");
    tracker.clearSession("s2");
    expect(tracker.consumeExecuteAllow("s2")).toBe(false);
    expect(isExecuteToolSubject({ kind: "execute" })).toBe(true);
    expect(isExecuteToolSubject({ kind: "edit" })).toBe(false);
    expect(isExecuteToolSubject(null)).toBe(false);
    expect(isExecuteToolSubject("x")).toBe(false);
  });
});

describe("runs/persist fallbacks", () => {
  it("round-trips valid payloads and rebuilds from corrupt JSON", () => {
    const run = finalizeRun(
      startRun({
        sessionId: "sess-1",
        agent: { id: "mock-agent", name: "Mock" },
        permissionMode: "always-ask",
        cwd: "/tmp/project",
        request: "hello",
        model: "m1",
        mode: "code",
      }),
      { outcome: "completed", stopReason: "end_turn" },
    );
    const score = createUserRating({ runId: run.id, value: 4 });
    expect((JSON.parse(runToRow(run).payloadJson) as RunRecord).id).toBe(run.id);
    expect((JSON.parse(scoreToRow(score).payloadJson) as RunScore).id).toBe(score.id);

    const badScore: ScoreRow = {
      id: "s1",
      runId: run.id,
      source: "user",
      value: 3,
      scaleMin: 1,
      scaleMax: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      payloadJson: "{not-json",
    };
    const rebuiltScore = rowToScore(badScore);
    expect(rebuiltScore.value).toBe(3);
    expect(rebuiltScore.source).toBe("user");

    const badRun: RunRow = {
      id: "r1",
      sessionId: "sess-1",
      kind: "judging",
      agentId: "mock-agent",
      cwd: "/tmp/project",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
      outcome: "completed",
      permissionMode: "always-ask",
      model: "m1",
      mode: "code",
      requestText: "judge",
      payloadJson: "{not-json",
    };
    const rebuilt = rowToRun(badRun, [rebuiltScore]);
    expect(rebuilt.kind).toBe("judging");
    expect(rebuilt.endedAt).toBe(badRun.endedAt);
    expect(rebuilt.outcome).toBe("completed");
    expect(rebuilt.model).toBe("m1");
    expect(rebuilt.mode).toBe("code");
    expect(rebuilt.scores).toHaveLength(1);
  });
});

describe("sessions/resume", () => {
  it("resolves resume mode and resumability gates", () => {
    expect(resolveResumeMode({ sessionCapabilities: { resume: {} } })).toBe("resume");
    expect(resolveResumeMode({ loadSession: true })).toBe("load");
    expect(resolveResumeMode({})).toBeNull();

    const session = sampleSession();
    expect(sessionIsResumable({ session, live: true, supportsResume: true })).toBe(false);
    const noAgentSession = sampleSession();
    delete noAgentSession.agentSessionId;
    expect(
      sessionIsResumable({
        session: noAgentSession,
        live: false,
        supportsResume: true,
      }),
    ).toBe(false);
    expect(
      sessionIsResumable({
        session: sampleSession({ status: "needs-login" }),
        live: false,
        supportsResume: true,
      }),
    ).toBe(false);
    expect(sessionIsResumable({ session, live: false, supportsLoad: true })).toBe(true);
  });

  it("reattaches via session/resume or session/load", async () => {
    const request = vi.fn(() => Promise.resolve(undefined));
    const resumeConnection = {
      capabilities: { agentCapabilities: { sessionCapabilities: { resume: {} } } },
      client: { request },
    } as unknown as AcpConnection;
    const missingId = sampleSession();
    delete missingId.agentSessionId;
    await expect(reattachAgentSession(resumeConnection, missingId)).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "not-resumable",
    );
    await expect(
      reattachAgentSession(
        {
          capabilities: { agentCapabilities: {} },
          client: { request },
        } as unknown as AcpConnection,
        sampleSession(),
      ),
    ).rejects.toSatisfy((error: unknown) => isSterError(error) && error.code === "not-resumable");

    const resumed = await reattachAgentSession(resumeConnection, sampleSession());
    expect(resumed.mode).toBe("resume");
    expect(request).toHaveBeenCalled();

    const loadConnection = {
      capabilities: { agentCapabilities: { loadSession: true } },
      client: { request },
    } as unknown as AcpConnection;
    const loaded = await reattachAgentSession(loadConnection, sampleSession());
    expect(loaded.mode).toBe("load");
  });
});
