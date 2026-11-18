import { randomUUID } from "node:crypto";
import type { ApprovalOption, ApprovalOutcome, ApprovalRequest } from "../model/events.js";
import type { EventStream, CoreEvent } from "../events/stream.js";
import { appendConversationItem } from "../sessions/items.js";
import type { Store } from "../store/store.js";
import { SterError } from "../errors.js";

export type OneTimeOptionKind = "allow_once" | "reject_once";

export interface PendingApproval extends ApprovalRequest {
  resolve: (outcome: ApprovalOutcome) => void;
}

export interface ApprovalBrokerOptions {
  store: Store;
  events: EventStream<CoreEvent>;
  /** Map local session id → current run id (for association). */
  currentRunId: (sessionId: string) => string | undefined;
  onStatusChange?: (sessionId: string, status: "waiting-approval" | "working") => void;
}

/**
 * Keep only one-time options; standing-permission kinds from the agent are dropped (FR-011).
 */
export function filterOneTimeOptions(
  options: ReadonlyArray<{ optionId: string; name: string; kind: string }>,
): ApprovalOption[] {
  return options
    .filter((o) => o.kind === "allow_once" || o.kind === "reject_once")
    .map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind }));
}

/**
 * Prompt-always approval broker for US1 (full modes/rules arrive in US3).
 */
export function createApprovalBroker(options: ApprovalBrokerOptions) {
  const pending = new Map<string, PendingApproval>();

  const cancelOne = (approval: PendingApproval, at: string): void => {
    const outcome: ApprovalOutcome = { by: "cancelled" };
    options.events.publish({
      type: "approval.resolved",
      sessionId: approval.sessionId,
      approvalId: approval.id,
      outcome,
    });
    appendConversationItem(options.store, {
      sessionId: approval.sessionId,
      kind: "notice",
      runId: approval.runId,
      payload: { notice: "approval-cancelled", approvalId: approval.id },
      createdAt: at,
    });
    approval.resolve(outcome);
  };

  return {
    /**
     * Create a pending approval and wait for `resolveApproval` (or cancel).
     */
    request(input: {
      sessionId: string;
      source: "agent" | "client-guard";
      subject: unknown;
      options: ReadonlyArray<{ optionId: string; name: string; kind: string }>;
      toolCallId?: string;
    }): Promise<ApprovalOutcome> {
      const oneTime = filterOneTimeOptions(input.options);
      if (oneTime.length === 0) {
        return Promise.resolve({ by: "cancelled" });
      }

      const runId = options.currentRunId(input.sessionId) ?? "none";
      const requestedAt = new Date().toISOString();
      const id = randomUUID();

      return new Promise<ApprovalOutcome>((resolve) => {
        const approval: PendingApproval = {
          id,
          sessionId: input.sessionId,
          runId,
          source: input.source,
          subject: input.subject,
          options: oneTime,
          requestedAt,
          resolve,
        };
        const publicApproval: ApprovalRequest = {
          id,
          sessionId: input.sessionId,
          runId,
          source: input.source,
          subject: input.subject,
          options: oneTime,
          requestedAt,
        };
        pending.set(id, approval);
        options.onStatusChange?.(input.sessionId, "waiting-approval");
        options.events.publish({
          type: "approval.requested",
          sessionId: input.sessionId,
          approval: publicApproval,
        });
        appendConversationItem(options.store, {
          sessionId: input.sessionId,
          kind: "approval",
          runId,
          payload: publicApproval,
          createdAt: requestedAt,
        });
      });
    },

    resolve(approvalId: string, decision: { optionId: string } | { cancelled: true }): void {
      const approval = pending.get(approvalId);
      if (!approval) {
        throw new SterError("not-found", `Unknown approval ${approvalId}`);
      }
      pending.delete(approvalId);
      const outcome: ApprovalOutcome =
        "cancelled" in decision ? { by: "cancelled" } : { by: "user", optionId: decision.optionId };

      if (outcome.by === "user") {
        const allowed = approval.options.some((o) => o.optionId === outcome.optionId);
        if (!allowed) {
          pending.set(approvalId, approval);
          throw new SterError("invalid-argument", "Option not offered for this approval");
        }
      }

      options.events.publish({
        type: "approval.resolved",
        sessionId: approval.sessionId,
        approvalId,
        outcome,
      });
      options.onStatusChange?.(approval.sessionId, "working");
      approval.resolve(outcome);
    },

    cancelSession(sessionId: string): void {
      const at = new Date().toISOString();
      for (const [id, approval] of [...pending.entries()]) {
        if (approval.sessionId === sessionId) {
          pending.delete(id);
          cancelOne(approval, at);
        }
      }
    },

    pendingFor(sessionId: string): ApprovalRequest[] {
      return [...pending.values()]
        .filter((a) => a.sessionId === sessionId)
        .map((pendingApproval) => ({
          id: pendingApproval.id,
          sessionId: pendingApproval.sessionId,
          runId: pendingApproval.runId,
          source: pendingApproval.source,
          subject: pendingApproval.subject,
          options: pendingApproval.options,
          requestedAt: pendingApproval.requestedAt,
        }));
    },
  };
}

export type ApprovalBroker = ReturnType<typeof createApprovalBroker>;
