import type { Store } from "../store/store.js";
import type { SessionStatus } from "./session.js";

const INTERRUPTED_STATUSES = new Set<SessionStatus>(["starting", "working", "waiting-approval"]);

export interface RecoveredSession {
  sessionId: string;
  previousStatus: string;
  openRunId?: string;
}

export interface RecoveryResult {
  sessions: RecoveredSession[];
}

interface SessionPayload {
  agentSessionId?: string;
  failureReason?: string;
  openRunId?: string;
  supportsResume?: boolean;
  supportsLoad?: boolean;
  interruptedRunIds?: string[];
}

/**
 * Startup recovery: sessions left mid-turn become `ended`, and any open run id
 * is recorded as interrupted (data-model.md Session / RunRecord).
 */
export function recoverInterruptedSessions(store: Store): RecoveryResult {
  const recovered: RecoveredSession[] = [];
  for (const row of store.listSessions()) {
    if (!INTERRUPTED_STATUSES.has(row.status as SessionStatus)) {
      continue;
    }
    let payload: SessionPayload = {};
    try {
      payload = JSON.parse(row.payloadJson) as SessionPayload;
    } catch {
      payload = {};
    }
    const entry: RecoveredSession = {
      sessionId: row.id,
      previousStatus: row.status,
    };
    if (payload.openRunId) {
      entry.openRunId = payload.openRunId;
      const interrupted = new Set(payload.interruptedRunIds ?? []);
      interrupted.add(payload.openRunId);
      payload.interruptedRunIds = [...interrupted];
      delete payload.openRunId;
    }
    store.putSession({
      ...row,
      status: "ended",
      lastActivityAt: new Date().toISOString(),
      payloadJson: JSON.stringify(payload),
    });
    recovered.push(entry);
  }
  return { sessions: recovered };
}
