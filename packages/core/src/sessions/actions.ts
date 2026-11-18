/**
 * AgentAction model and tool_call merge helpers (data-model.md `AgentAction`).
 */

export type ActionKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ActionStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ActionLocation {
  path: string;
  line?: number;
}

export type ActionContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText?: string; newText?: string }
  | { type: "terminal"; commandRunId: string };

export interface AgentAction {
  toolCallId: string;
  title: string;
  toolName?: string;
  kind: ActionKind;
  status: ActionStatus;
  locations: ActionLocation[];
  content: ActionContent[];
}

const STATUS_RANK: Readonly<Record<ActionStatus, number>> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
  failed: 2,
};

const KNOWN_KINDS = new Set<string>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

/**
 * True when `next` is allowed after `current` (status never moves backwards).
 */
export function canAdvanceActionStatus(current: ActionStatus, next: ActionStatus): boolean {
  if (current === next) {
    return true;
  }
  // completed/failed are terminal peers; do not cross between them.
  if (
    (current === "completed" || current === "failed") &&
    (next === "completed" || next === "failed") &&
    current !== next
  ) {
    return false;
  }
  return STATUS_RANK[next] >= STATUS_RANK[current];
}

export function normalizeActionKind(value: unknown): ActionKind {
  if (typeof value === "string" && KNOWN_KINDS.has(value)) {
    return value as ActionKind;
  }
  return "other";
}

export function normalizeActionStatus(value: unknown): ActionStatus {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  return "pending";
}

function asLocations(value: unknown): ActionLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ActionLocation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["path"] !== "string") {
      continue;
    }
    const location: ActionLocation = { path: record["path"] };
    if (typeof record["line"] === "number") {
      location.line = record["line"];
    }
    out.push(location);
  }
  return out;
}

function asContent(value: unknown): ActionContent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ActionContent[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !("type" in entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (record["type"] === "text" && typeof record["text"] === "string") {
      out.push({ type: "text", text: record["text"] });
      continue;
    }
    if (record["type"] === "diff" && typeof record["path"] === "string") {
      const diff: {
        type: "diff";
        path: string;
        oldText?: string;
        newText?: string;
      } = { type: "diff", path: record["path"] };
      if (typeof record["oldText"] === "string") {
        diff.oldText = record["oldText"];
      }
      if (typeof record["newText"] === "string") {
        diff.newText = record["newText"];
      }
      out.push(diff);
      continue;
    }
    if (record["type"] === "terminal" && typeof record["commandRunId"] === "string") {
      out.push({ type: "terminal", commandRunId: record["commandRunId"] });
    }
  }
  return out;
}

/**
 * Build an AgentAction from a raw ACP tool_call / tool_call_update payload.
 */
export function actionFromUpdate(update: Record<string, unknown>): AgentAction | null {
  const toolCallId = update["toolCallId"];
  if (typeof toolCallId !== "string" || toolCallId.length === 0) {
    return null;
  }
  const title =
    typeof update["title"] === "string" && update["title"].length > 0
      ? update["title"]
      : toolCallId;
  const action: AgentAction = {
    toolCallId,
    title,
    kind: normalizeActionKind(update["kind"]),
    status: normalizeActionStatus(update["status"]),
    locations: asLocations(update["locations"]),
    content: asContent(update["content"]),
  };
  if (typeof update["toolName"] === "string") {
    action.toolName = update["toolName"];
  }
  return action;
}

/**
 * Merge a tool_call_update into an existing action. Status never moves backwards;
 * locations/content replace when provided; title/kind/toolName update when present.
 */
export function mergeActionUpdate(
  current: AgentAction,
  patch: Record<string, unknown>,
): AgentAction {
  const nextStatus = "status" in patch ? normalizeActionStatus(patch["status"]) : current.status;
  const status = canAdvanceActionStatus(current.status, nextStatus) ? nextStatus : current.status;

  const merged: AgentAction = {
    toolCallId: current.toolCallId,
    title:
      typeof patch["title"] === "string" && patch["title"].length > 0
        ? patch["title"]
        : current.title,
    kind: "kind" in patch ? normalizeActionKind(patch["kind"]) : current.kind,
    status,
    locations: "locations" in patch ? asLocations(patch["locations"]) : current.locations,
    content: "content" in patch ? asContent(patch["content"]) : current.content,
  };
  if (typeof patch["toolName"] === "string") {
    merged.toolName = patch["toolName"];
  } else if (current.toolName !== undefined) {
    merged.toolName = current.toolName;
  }
  return merged;
}
