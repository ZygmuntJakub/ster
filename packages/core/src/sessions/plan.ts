/**
 * Plan conversation item payload (data-model.md ConversationItem.kind = plan).
 * Latest plan state replaces earlier entries for the session turn.
 */

export type PlanEntryStatus = "pending" | "in_progress" | "completed";
export type PlanEntryPriority = "high" | "medium" | "low";

export interface PlanEntry {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
}

export interface PlanPayload {
  entries: PlanEntry[];
}

function asPriority(value: unknown): PlanEntryPriority {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

function asStatus(value: unknown): PlanEntryStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  return "pending";
}

/**
 * Parse a plan update into a stable payload. Invalid entries are skipped.
 */
export function planFromUpdate(update: Record<string, unknown>): PlanPayload {
  const raw = update["entries"];
  if (!Array.isArray(raw)) {
    return { entries: [] };
  }
  const entries: PlanEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["content"] !== "string") {
      continue;
    }
    entries.push({
      content: record["content"],
      priority: asPriority(record["priority"]),
      status: asStatus(record["status"]),
    });
  }
  return { entries };
}
