import { randomUUID } from "node:crypto";
import type { RunSummary } from "../model/events.js";

export type RunOutcome = "completed" | "cancelled" | "failed" | "interrupted";

export type RunKind = "task" | "judging";

export interface RunRecord {
  id: string;
  sessionId: string;
  kind: RunKind;
  startedAt: string;
  endedAt?: string;
  outcome?: RunOutcome;
  stopReason?: string;
  error?: string;
  request?: string | null;
}

/**
 * Create an in-memory run when a prompt is sent (data-model.md `RunRecord`).
 */
export function startRun(input: {
  sessionId: string;
  kind?: RunKind;
  request?: string;
  now?: () => Date;
}): RunRecord {
  const now = input.now ?? (() => new Date());
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    kind: input.kind ?? "task",
    startedAt: now().toISOString(),
    request: input.request ?? null,
  };
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
  const next: RunRecord = {
    ...run,
    endedAt,
    outcome: result.outcome,
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
