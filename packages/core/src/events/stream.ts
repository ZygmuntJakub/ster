import type {
  ApprovalOutcome,
  ApprovalRequest,
  CommandExit,
  ConversationItem,
  ItemPatch,
  RegistryStatus,
  RunSummary,
  Score,
  SessionSummary,
} from "../model/events.js";

/**
 * Session and core events from contracts/core-api.md.
 * Every delivered event also carries `at` and a per-session monotonically increasing `n`.
 */
export type CoreEventPayload =
  | {
      type: "session.created" | "session.status" | "session.updated" | "session.deleted";
      sessionId: string;
      session?: SessionSummary;
    }
  | { type: "item.appended"; sessionId: string; item: ConversationItem }
  | { type: "item.updated"; sessionId: string; seq: number; patch: ItemPatch }
  | { type: "approval.requested"; sessionId: string; approval: ApprovalRequest }
  | {
      type: "approval.resolved";
      sessionId: string;
      approvalId: string;
      outcome: ApprovalOutcome;
    }
  | {
      type: "command.started" | "command.output" | "command.exited";
      sessionId: string;
      commandRunId: string;
      data?: string;
      exit?: CommandExit;
      command?: string;
      args?: string[];
      cwd?: string;
      truncated?: boolean;
    }
  | { type: "run.started" | "run.finished"; sessionId: string; run: RunSummary }
  | { type: "score.recorded"; runId: string; score: Score }
  | { type: "agent.changed"; agentId: string }
  | { type: "registry.updated"; status: RegistryStatus }
  | {
      type: "install.progress";
      planId: string;
      phase: string;
      received?: number;
      total?: number;
    };

export type CoreEvent = CoreEventPayload & {
  at: string;
  /** Per-session sequence (0 for non-session events such as registry/agent). */
  n: number;
};

export type EventFilter = {
  sessionId?: string;
  types?: ReadonlyArray<CoreEvent["type"]>;
};

export type EventListener = (event: CoreEvent) => void;

export interface EventStream<TEvent> {
  subscribe(listener: (event: TEvent) => void, filter?: EventFilter): () => void;
  publish(event: CoreEventPayload): CoreEvent;
}

/**
 * In-process typed event stream with per-session ordering.
 * Listeners for the same session receive events in publish order; cross-session
 * interleaving is allowed. Publishing never awaits listeners.
 */
export function createEventStream(options?: { now?: () => Date }): EventStream<CoreEvent> {
  const now = options?.now ?? (() => new Date());
  const listeners = new Set<{
    listener: EventListener;
    filter?: EventFilter;
  }>();
  const sessionSeq = new Map<string, number>();

  const matches = (event: CoreEvent, filter?: EventFilter): boolean => {
    if (!filter) {
      return true;
    }
    if (filter.sessionId !== undefined) {
      if (!("sessionId" in event) || event.sessionId !== filter.sessionId) {
        return false;
      }
    }
    if (filter.types !== undefined && !filter.types.includes(event.type)) {
      return false;
    }
    return true;
  };

  return {
    subscribe(listener, filter) {
      const entry: { listener: EventListener; filter?: EventFilter } = filter
        ? { listener, filter }
        : { listener };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    publish(payload) {
      const sessionId = "sessionId" in payload ? payload.sessionId : undefined;
      let n = 0;
      if (sessionId !== undefined) {
        const next = (sessionSeq.get(sessionId) ?? 0) + 1;
        sessionSeq.set(sessionId, next);
        n = next;
      }
      const event: CoreEvent = {
        ...payload,
        at: now().toISOString(),
        n,
      };
      for (const entry of listeners) {
        if (matches(event, entry.filter)) {
          entry.listener(event);
        }
      }
      return event;
    },
  };
}
