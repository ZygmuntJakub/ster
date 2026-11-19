import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import type { RunRecord } from "./lifecycle.js";
import { toExportRecord } from "./lifecycle.js";

export type WritableTarget = { kind: "path"; path: string };

/**
 * Write run records as JSON Lines (one export object per line).
 */
export async function exportRunRecords(
  runs: readonly RunRecord[],
  destination: WritableTarget,
): Promise<{ count: number }> {
  const stream = createWriteStream(destination.path, { encoding: "utf8" });
  for (const run of runs) {
    const line = `${JSON.stringify(toExportRecord(run))}\n`;
    if (!stream.write(line)) {
      await new Promise<void>((resolve) => {
        stream.once("drain", () => {
          resolve();
        });
      });
    }
  }
  stream.end();
  await finished(stream);
  return { count: runs.length };
}

/**
 * Validate a parsed export line against the required run-record fields.
 */
export function validateExportRecord(raw: unknown): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, problems: ["record must be an object"] };
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    problems.push("schemaVersion must be 1");
  }
  for (const key of [
    "id",
    "sessionId",
    "kind",
    "agent",
    "permissionMode",
    "cwd",
    "startedAt",
    "outcome",
    "actions",
    "approvals",
    "commands",
    "scores",
  ]) {
    if (!(key in record)) {
      problems.push(`missing ${key}`);
    }
  }
  if (record.kind !== "task" && record.kind !== "judging") {
    problems.push("kind must be task or judging");
  }
  const outcomes = new Set(["completed", "cancelled", "failed", "interrupted"]);
  if (typeof record.outcome === "string" && !outcomes.has(record.outcome)) {
    problems.push("invalid outcome");
  }
  if (!Array.isArray(record.actions)) {
    problems.push("actions must be an array");
  }
  if (!Array.isArray(record.approvals)) {
    problems.push("approvals must be an array");
  }
  if (!Array.isArray(record.commands)) {
    problems.push("commands must be an array");
  }
  if (!Array.isArray(record.scores)) {
    problems.push("scores must be an array");
  }
  return { ok: problems.length === 0, problems };
}
