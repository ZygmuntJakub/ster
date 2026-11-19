import type { RunRow, ScoreRow, Store } from "../store/store.js";
import type { RunRecord, RunScore } from "./lifecycle.js";

/**
 * Serialize a run for the SQLite runs table (indexed columns + full JSON payload).
 */
export function runToRow(run: RunRecord): RunRow {
  return {
    id: run.id,
    sessionId: run.sessionId,
    kind: run.kind,
    agentId: run.agent.id,
    cwd: run.cwd,
    startedAt: run.startedAt,
    endedAt: run.endedAt ?? null,
    outcome: run.outcome ?? null,
    permissionMode: run.permissionMode,
    model: run.model ?? null,
    mode: run.mode ?? null,
    requestText: run.request === undefined ? null : run.request,
    payloadJson: JSON.stringify(run),
  };
}

export function scoreToRow(score: RunScore): ScoreRow {
  return {
    id: score.id,
    runId: score.runId,
    source: score.source,
    value: score.value,
    scaleMin: score.scale.min,
    scaleMax: score.scale.max,
    createdAt: score.createdAt,
    updatedAt: score.updatedAt ?? score.createdAt,
    payloadJson: JSON.stringify(score),
  };
}

export function rowToScore(row: ScoreRow): RunScore {
  try {
    return JSON.parse(row.payloadJson) as RunScore;
  } catch {
    return {
      id: row.id,
      runId: row.runId,
      source: row.source === "agent" ? "agent" : "user",
      value: row.value,
      scale: { min: row.scaleMin, max: row.scaleMax },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export function rowToRun(row: RunRow, scores: RunScore[] = []): RunRecord {
  try {
    const parsed = JSON.parse(row.payloadJson) as RunRecord;
    return { ...parsed, scores };
  } catch {
    const record: RunRecord = {
      schemaVersion: 1,
      id: row.id,
      sessionId: row.sessionId,
      kind: row.kind === "judging" ? "judging" : "task",
      request: row.requestText,
      agent: { id: row.agentId, name: row.agentId },
      permissionMode: row.permissionMode,
      cwd: row.cwd,
      startedAt: row.startedAt,
      actions: [],
      approvals: [],
      commands: [],
      scores,
    };
    if (row.endedAt !== null) {
      record.endedAt = row.endedAt;
    }
    if (row.outcome !== null) {
      record.outcome = row.outcome as NonNullable<RunRecord["outcome"]>;
    }
    if (row.model !== null) {
      record.model = row.model;
    }
    if (row.mode !== null) {
      record.mode = row.mode;
    }
    return record;
  }
}

export function persistRun(store: Store, run: RunRecord): void {
  store.putRun(runToRow(run));
}

export function persistScore(store: Store, score: RunScore): void {
  store.putScore(scoreToRow(score));
}

export function loadRun(store: Store, runId: string): RunRecord | null {
  const row = store.getRun(runId);
  if (!row) {
    return null;
  }
  const scores = store.listScoresForRun(runId).map(rowToScore);
  return rowToRun(row, scores);
}

export function loadAllRuns(store: Store): RunRecord[] {
  return store.listRuns().map((row) => {
    const scores = store.listScoresForRun(row.id).map(rowToScore);
    return rowToRun(row, scores);
  });
}
