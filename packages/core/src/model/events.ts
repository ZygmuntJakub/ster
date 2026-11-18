/**
 * Minimal domain shapes referenced by `CoreEvent` (contracts/core-api.md).
 * Full models land in later session/run/agent tasks; these fields are stable.
 */

export interface SessionSummary {
  id: string;
  agentId: string;
  title: string;
  status: string;
  cwd: string;
  lastActivityAt: string;
  resumable?: boolean;
  needsAttention?: boolean;
  agentVersion?: string;
}

export interface ConversationItem {
  sessionId: string;
  seq: number;
  kind: string;
  runId: string;
  createdAt: string;
  payload: unknown;
}

export type ItemPatch = Record<string, unknown>;

export interface ApprovalOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  runId: string;
  source: "agent" | "client-guard";
  subject: unknown;
  options: ApprovalOption[];
  requestedAt: string;
}

export type ApprovalOutcome =
  | { by: "user"; optionId: string }
  | { by: "rule"; ruleId: string; optionId: string }
  | { by: "mode"; optionId: string }
  | { by: "cancelled" };

export interface CommandExit {
  code?: number | null;
  signal?: string | null;
}

export interface RunSummary {
  id: string;
  sessionId: string;
  kind: string;
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  agentId?: string;
  agentName?: string;
  cwd?: string;
  model?: string;
  userRating?: number;
  agentScore?: number;
}

export interface Score {
  id: string;
  runId: string;
  source: "user" | "agent";
  value: number;
  createdAt: string;
  scale?: { min: number; max: number };
  note?: string;
  reasoning?: string;
  criteria?: Array<{ id: string; value: number }>;
  judge?: {
    agentId: string;
    version?: string;
    model?: string;
    judgingRunId?: string;
  };
  updatedAt?: string;
}

export interface RegistryStatus {
  reachable: boolean;
  fetchedAt?: string;
  sourceUrl?: string;
  error?: string;
}
