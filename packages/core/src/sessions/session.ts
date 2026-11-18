/**
 * Session model and status state machine (data-model.md `Session`).
 */

import type { AvailableCommandInfo, ConfigOption } from "./config-options.js";

export type SessionStatus =
  "starting" | "idle" | "working" | "waiting-approval" | "needs-login" | "failed" | "ended";

export interface Session {
  id: string;
  agentSessionId?: string;
  agentId: string;
  agentVersion: string;
  cwd: string;
  title: string;
  status: SessionStatus;
  permissionMode: string;
  createdAt: string;
  lastActivityAt: string;
  failureReason?: string;
  /** Derived: agent advertised resume/load and an agentSessionId is stored. */
  resumable?: boolean;
  needsAttention?: boolean;
  supportsResume?: boolean;
  supportsLoad?: boolean;
  openRunId?: string;
  /** Modes/models/thought level from the agent (FR-033/FR-034). */
  configOptions?: ConfigOption[];
  /** Slash commands from `available_commands_update`. */
  availableCommands?: AvailableCommandInfo[];
  /** Hash of the trusted factory definition applied at session create (US11). */
  factoryDefinitionHash?: string;
}

export interface SessionFilter {
  agentId?: string;
  cwd?: string;
  status?: string;
}

const TRANSITIONS: Readonly<Record<SessionStatus, ReadonlySet<SessionStatus>>> = {
  starting: new Set(["idle", "needs-login", "failed", "ended"]),
  idle: new Set(["working", "ended", "failed", "starting"]),
  working: new Set(["idle", "waiting-approval", "failed", "ended"]),
  "waiting-approval": new Set(["working", "idle", "failed", "ended"]),
  "needs-login": new Set(["starting", "failed", "ended"]),
  failed: new Set(["starting", "ended"]),
  ended: new Set(),
};

/**
 * Apply a status transition. Throws when the transition is illegal.
 */
export function transitionSessionStatus(
  current: SessionStatus,
  next: SessionStatus,
): SessionStatus {
  if (current === next) {
    return current;
  }
  const allowed = TRANSITIONS[current];
  if (!allowed.has(next)) {
    throw new Error(`Illegal session transition ${current} → ${next}`);
  }
  return next;
}

export function isActiveSessionStatus(status: SessionStatus): boolean {
  return status !== "ended" && status !== "failed";
}
