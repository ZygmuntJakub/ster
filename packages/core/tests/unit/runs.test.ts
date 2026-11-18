import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportRunRecords, validateExportRecord } from "../../src/runs/export.js";
import { finalizeRun, startRun, toExportRecord, type RunRecord } from "../../src/runs/lifecycle.js";
import { averageScores, createAgentScore, createUserRating } from "../../src/runs/scores.js";
import { parseJudgeResponse } from "../../src/runs/judge.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sampleRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const base = startRun({
    sessionId: "sess-1",
    agent: { id: "mock-agent", name: "Mock" },
    permissionMode: "always-ask",
    cwd: "/tmp/project",
    request: "hello",
  });
  const finished = finalizeRun(base, { outcome: "completed", stopReason: "end_turn" });
  return { ...finished, ...overrides, scores: overrides.scores ?? finished.scores };
}

describe("run scores", () => {
  it("creates user ratings on a 1–5 scale and rejects out of range", () => {
    const score = createUserRating({ runId: "r1", value: 4, note: "solid" });
    expect(score.source).toBe("user");
    expect(score.scale).toEqual({ min: 1, max: 5 });
    expect(score.note).toBe("solid");
    expect(() => createUserRating({ runId: "r1", value: 6 })).toThrow(/1 and 5/);
  });

  it("keeps agent scores on their own scale", () => {
    const score = createAgentScore({
      runId: "r1",
      value: 8,
      scale: { min: 0, max: 10 },
      judge: { agentId: "mock-agent" },
      reasoning: "ok",
    });
    expect(score.source).toBe("agent");
    expect(score.scale.max).toBe(10);
  });

  it("averages scores without mixing sources in callers", () => {
    const user = [
      createUserRating({ runId: "a", value: 4 }),
      createUserRating({ runId: "b", value: 2 }),
    ];
    const agent = [
      createAgentScore({
        runId: "a",
        value: 9,
        scale: { min: 0, max: 10 },
        judge: { agentId: "j" },
      }),
    ];
    expect(averageScores(user)).toBe(3);
    expect(averageScores(agent)).toBe(9);
  });
});

describe("judge response parsing", () => {
  it("extracts JSON from fenced or embedded text", () => {
    const parsed = parseJudgeResponse('Here you go:\n```json\n{"value":7,"reasoning":"fine"}\n```');
    expect(parsed?.value).toBe(7);
    expect(parsed?.reasoning).toBe("fine");
  });
});

describe("run export", () => {
  it("writes JSON Lines that validate against the export shape", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ster-runs-export-"));
    dirs.push(dir);
    const path = join(dir, "runs.jsonl");
    const run = sampleRun({
      scores: [
        createUserRating({ runId: "x", value: 5 }),
        createAgentScore({
          runId: "x",
          value: 8,
          scale: { min: 0, max: 10 },
          judge: { agentId: "mock-agent", judgingRunId: "j1" },
        }),
      ],
    });
    run.scores = run.scores.map((score) => ({ ...score, runId: run.id }));

    const result = await exportRunRecords([run], { kind: "path", path });
    expect(result.count).toBe(1);

    const line = readFileSync(path, "utf8").trim();
    const parsed = JSON.parse(line) as unknown;
    const check = validateExportRecord(parsed);
    expect(check.ok).toBe(true);
    expect(toExportRecord(run).schemaVersion).toBe(1);
  });
});
