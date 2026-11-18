import { randomUUID } from "node:crypto";
import type { RunSummary } from "../model/events.js";

export type RunOutcome = "completed" | "cancelled" | "failed" | "interrupted";

export type RunKind = "task" | "judging";

export interface RunAgentSnapshot {
  id: string;
  name: string;
  version?: string;
}

export interface RunActionRecord {
  toolCallId: string;
  kind: string;
  title?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  locations?: Array<{ path: string; line?: number }>;
}

export interface RunApprovalRecord {
  subject: string;
  decidedBy: "user" | "rule" | "mode" | "cancelled";
  optionKind?: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface RunCommandRecord {
  command: string;
  exitCode?: number;
  durationMs?: number;
}

export interface RunUsage {
  contextUsed?: number;
  contextSize?: number;
  cost?: { amount: number; currency: string };
}

export interface RunScoreCriterion {
  id: string;
  value: number;
}

export interface RunScoreJudge {
  agentId: string;
  version?: string;
  model?: string;
  judgingRunId?: string;
}

export interface RunScore {
  id: string;
  runId: string;
  source: "user" | "agent";
  value: number;
  scale: { min: number; max: number };
  note?: string;
  reasoning?: string;
  criteria?: RunScoreCriterion[];
  judge?: RunScoreJudge;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Full run record (contracts/run-record.schema.json / data-model.md).
 */
export interface RunRecord {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  kind: RunKind;
  request?: string | null;
  agent: RunAgentSnapshot;
  model?: string;
  mode?: string;
  permissionMode: string;
  cwd: string;
  factoryDefinitionHash?: string;
  templateId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome?: RunOutcome;
  stopReason?: string;
  error?: string;
  actions: RunActionRecord[];
  approvals: RunApprovalRecord[];
  commands: RunCommandRecord[];
  usage?: RunUsage;
  scores: RunScore[];
}

export const USER_RATING_SCALE = { min: 1, max: 5 } as const;

/**
 * Create an in-memory run when a prompt is sent (data-model.md `RunRecord`).
 */
export function startRun(input: {
  sessionId: string;
  agent: RunAgentSnapshot;
  permissionMode: string;
  cwd: string;
  kind?: RunKind;
  request?: string | null;
  model?: string;
  mode?: string;
  factoryDefinitionHash?: string;
  templateId?: string;
  now?: () => Date;
}): RunRecord {
  const now = input.now ?? (() => new Date());
  const record: RunRecord = {
    schemaVersion: 1,
    id: randomUUID(),
    sessionId: input.sessionId,
    kind: input.kind ?? "task",
    request: input.request ?? null,
    agent: input.agent,
    permissionMode: input.permissionMode,
    cwd: input.cwd,
    startedAt: now().toISOString(),
    actions: [],
    approvals: [],
    commands: [],
    scores: [],
  };
  if (input.model !== undefined) {
    record.model = input.model;
  }
  if (input.mode !== undefined) {
    record.mode = input.mode;
  }
  if (input.factoryDefinitionHash !== undefined) {
    record.factoryDefinitionHash = input.factoryDefinitionHash;
  }
  if (input.templateId !== undefined) {
    record.templateId = input.templateId;
  }
  return record;
}

/**
 * Finalise a run when the turn stops.
 */
export function finalizeRun(
  run: RunRecord,
  result: { outcome: RunOutcome; stopReason?: string; error?: string; now?: () => Date },
): RunRecord {
  const now = result.now ?? (() => new Date());
  const endedAt = now().toISOString();
  const startedMs = Date.parse(run.startedAt);
  const endedMs = Date.parse(endedAt);
  const next: RunRecord = {
    ...run,
    endedAt,
    outcome: result.outcome,
    durationMs:
      Number.isFinite(startedMs) && Number.isFinite(endedMs) ? Math.max(0, endedMs - startedMs) : 0,
    actions: [...run.actions],
    approvals: [...run.approvals],
    commands: [...run.commands],
    scores: [...run.scores],
  };
  if (result.stopReason !== undefined) {
    next.stopReason = result.stopReason;
  }
  if (result.error !== undefined) {
    next.error = result.error;
  }
  return next;
}

export function toRunSummary(run: RunRecord): RunSummary {
  const summary: RunSummary = {
    id: run.id,
    sessionId: run.sessionId,
    kind: run.kind,
    startedAt: run.startedAt,
  };
  if (run.endedAt !== undefined) {
    summary.endedAt = run.endedAt;
  }
  if (run.outcome !== undefined) {
    summary.outcome = run.outcome;
  }
  return summary;
}

export function outcomeFromStopReason(stopReason: string): RunOutcome {
  if (stopReason === "cancelled") {
    return "cancelled";
  }
  if (stopReason === "end_turn" || stopReason === "max_tokens" || stopReason === "refusal") {
    return "completed";
  }
  return "failed";
}

/**
 * Shape used for JSON Lines export (contracts/run-record.schema.json).
 */
export function toExportRecord(run: RunRecord): Record<string, unknown> {
  const record: Record<string, unknown> = {
    schemaVersion: 1,
    id: run.id,
    sessionId: run.sessionId,
    kind: run.kind,
    request: run.request ?? null,
    agent: run.agent,
    permissionMode: run.permissionMode,
    cwd: run.cwd,
    startedAt: run.startedAt,
    outcome: run.outcome ?? "interrupted",
    actions: run.actions,
    approvals: run.approvals,
    commands: run.commands,
    scores: run.scores.map((score) => {
      const entry: Record<string, unknown> = {
        source: score.source,
        value: score.value,
        scale: score.scale,
        createdAt: score.createdAt,
      };
      if (score.note !== undefined) {
        entry.note = score.note;
      }
      if (score.reasoning !== undefined) {
        entry.reasoning = score.reasoning;
      }
      if (score.criteria !== undefined) {
        entry.criteria = score.criteria;
      }
      if (score.judge !== undefined) {
        entry.judge = score.judge;
      }
      return entry;
    }),
  };
  if (run.model !== undefined) {
    record.model = run.model;
  }
  if (run.mode !== undefined) {
    record.mode = run.mode;
  }
  if (run.factoryDefinitionHash !== undefined) {
    record.factoryDefinitionHash = run.factoryDefinitionHash;
  }
  if (run.templateId !== undefined) {
    record.templateId = run.templateId;
  }
  if (run.endedAt !== undefined) {
    record.endedAt = run.endedAt;
  }
  if (run.durationMs !== undefined) {
    record.durationMs = run.durationMs;
  }
  if (run.stopReason !== undefined) {
    record.stopReason = run.stopReason;
  }
  if (run.error !== undefined) {
    record.error = run.error;
  }
  if (run.usage !== undefined) {
    record.usage = run.usage;
  }
  return record;
}
