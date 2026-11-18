import { randomUUID } from "node:crypto";
import type { PermissionModeDefinition, PermissionRequestView } from "../extensions/index.js";
import type { ApprovalOption, ApprovalOutcome, ApprovalRequest } from "../model/events.js";
import type { EventStream, CoreEvent } from "../events/stream.js";
import { appendConversationItem } from "../sessions/items.js";
import type { Store } from "../store/store.js";
import { SterError } from "../errors.js";
import { decidePermission, STER_REMEMBER_OPTION_ID, withRememberOption } from "./engine.js";
import { BUILTIN_PERMISSION_MODES } from "./modes.js";
import type { PermissionRule, RuleStore } from "./rules.js";
import {
  createExecuteApprovalTracker,
  isExecuteToolSubject,
  type ExecuteApprovalTracker,
} from "./guard.js";

export type OneTimeOptionKind = "allow_once" | "reject_once";

export interface PendingApproval extends ApprovalRequest {
  resolve: (outcome: ApprovalOutcome) => void;
  /** Kind/toolName used when the user picks remember. */
  rememberMatch?: { kind: string; toolName?: string };
  /** Agent allow_once id to return when remember is chosen. */
  allowOnceOptionId?: string;
}

export interface ApprovalBrokerOptions {
  store: Store;
  events: EventStream<CoreEvent>;
  /** Map local session id → current run id (for association). */
  currentRunId: (sessionId: string) => string | undefined;
  getPermissionMode: (sessionId: string) => string;
  getSessionCwd: (sessionId: string) => string | undefined;
  rules: RuleStore;
  permissionModes?: ReadonlyArray<PermissionModeDefinition>;
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

function toolCallView(
  subject: unknown,
  options: ReadonlyArray<{ optionId: string; name: string; kind: string }>,
  source: "agent" | "client-guard",
): PermissionRequestView {
  const record = subject && typeof subject === "object" ? (subject as Record<string, unknown>) : {};
  const view: PermissionRequestView = {
    options: [...options],
    source,
  };
  if (typeof record["kind"] === "string") {
    view.kind = record["kind"];
  }
  if (typeof record["toolName"] === "string") {
    view.toolName = record["toolName"];
  } else if (typeof record["name"] === "string") {
    view.toolName = record["name"];
  }
  if (Array.isArray(record["locations"])) {
    view.locations = record["locations"] as Array<{ path: string; line?: number }>;
  }
  return view;
}

function indexModes(
  extra: ReadonlyArray<PermissionModeDefinition> | undefined,
): Map<string, PermissionModeDefinition> {
  const map = new Map<string, PermissionModeDefinition>();
  for (const mode of BUILTIN_PERMISSION_MODES) {
    map.set(mode.id, mode);
  }
  for (const mode of extra ?? []) {
    map.set(mode.id, mode);
  }
  return map;
}

/**
 * Permission-aware approval broker (US3): modes, session rules, notices, remember choice.
 */
export function createApprovalBroker(options: ApprovalBrokerOptions) {
  const pending = new Map<string, PendingApproval>();
  const modes = indexModes(options.permissionModes);
  const executeAllows: ExecuteApprovalTracker = createExecuteApprovalTracker();

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

  const publishAutoNotice = (
    sessionId: string,
    runId: string,
    outcome: ApprovalOutcome,
    subject: unknown,
  ): void => {
    const at = new Date().toISOString();
    appendConversationItem(options.store, {
      sessionId,
      kind: "notice",
      runId,
      payload: {
        notice: outcome.by === "rule" ? "approval-by-rule" : "approval-by-mode",
        outcome,
        subject,
      },
      createdAt: at,
    });
  };

  const finishAllow = (
    sessionId: string,
    subject: unknown,
    outcome: ApprovalOutcome,
    offered?: ReadonlyArray<ApprovalOption>,
  ): void => {
    if (!isExecuteToolSubject(subject)) {
      return;
    }
    if (outcome.by !== "user" && outcome.by !== "rule" && outcome.by !== "mode") {
      return;
    }
    const kind = offered?.find((option) => option.optionId === outcome.optionId)?.kind;
    if (kind === "reject_once" || /reject/i.test(outcome.optionId)) {
      return;
    }
    executeAllows.noteExecuteAllow(sessionId);
  };

  return {
    executeAllows,

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
      const modeId = options.getPermissionMode(input.sessionId);
      const cwd = options.getSessionCwd(input.sessionId) ?? "";
      const requestView = toolCallView(input.subject, input.options, input.source);
      const decision = decidePermission({
        request: requestView,
        modeId,
        rules: options.rules.list(input.sessionId),
        modes,
        sessionId: input.sessionId,
        cwd,
      });

      if (decision.type === "auto") {
        const outcome: ApprovalOutcome =
          decision.by === "rule" && decision.ruleId
            ? { by: "rule", ruleId: decision.ruleId, optionId: decision.optionId }
            : { by: "mode", optionId: decision.optionId };
        publishAutoNotice(input.sessionId, runId, outcome, input.subject);
        options.events.publish({
          type: "approval.resolved",
          sessionId: input.sessionId,
          approvalId: `auto-${randomUUID()}`,
          outcome,
        });
        finishAllow(input.sessionId, input.subject, outcome, oneTime);
        return Promise.resolve(outcome);
      }

      const promptOptions = withRememberOption(decision.options, decision.offerRemember);
      const requestedAt = new Date().toISOString();
      const id = randomUUID();
      const allowOnceOptionId = oneTime.find((o) => o.kind === "allow_once")?.optionId;
      const rememberMatch =
        decision.offerRemember && requestView.kind
          ? requestView.toolName !== undefined
            ? { kind: requestView.kind, toolName: requestView.toolName }
            : { kind: requestView.kind }
          : undefined;

      return new Promise<ApprovalOutcome>((resolve) => {
        const approval: PendingApproval = {
          id,
          sessionId: input.sessionId,
          runId,
          source: input.source,
          subject: input.subject,
          options: promptOptions,
          requestedAt,
          resolve,
        };
        if (rememberMatch) {
          approval.rememberMatch = rememberMatch;
        }
        if (allowOnceOptionId) {
          approval.allowOnceOptionId = allowOnceOptionId;
        }
        const publicApproval: ApprovalRequest = {
          id,
          sessionId: input.sessionId,
          runId,
          source: input.source,
          subject: input.subject,
          options: promptOptions,
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

      if ("cancelled" in decision) {
        const outcome: ApprovalOutcome = { by: "cancelled" };
        options.events.publish({
          type: "approval.resolved",
          sessionId: approval.sessionId,
          approvalId,
          outcome,
        });
        options.onStatusChange?.(approval.sessionId, "working");
        approval.resolve(outcome);
        return;
      }

      if (decision.optionId === STER_REMEMBER_OPTION_ID) {
        if (
          approval.source === "client-guard" ||
          !approval.rememberMatch ||
          !approval.allowOnceOptionId
        ) {
          pending.set(approvalId, approval);
          throw new SterError("invalid-argument", "Remember is not available for this approval");
        }
        const rule = options.rules.add({
          sessionId: approval.sessionId,
          kind: approval.rememberMatch.kind,
          ...(approval.rememberMatch.toolName !== undefined
            ? { toolName: approval.rememberMatch.toolName }
            : {}),
        });
        const outcome: ApprovalOutcome = {
          by: "user",
          optionId: approval.allowOnceOptionId,
        };
        appendConversationItem(options.store, {
          sessionId: approval.sessionId,
          kind: "notice",
          runId: approval.runId,
          payload: {
            notice: "rule-created",
            ruleId: rule.id,
            match: rule.match,
          },
          createdAt: new Date().toISOString(),
        });
        options.events.publish({
          type: "approval.resolved",
          sessionId: approval.sessionId,
          approvalId,
          outcome,
        });
        options.onStatusChange?.(approval.sessionId, "working");
        finishAllow(approval.sessionId, approval.subject, outcome, approval.options);
        approval.resolve(outcome);
        return;
      }

      const allowed = approval.options.some((o) => o.optionId === decision.optionId);
      if (!allowed) {
        pending.set(approvalId, approval);
        throw new SterError("invalid-argument", "Option not offered for this approval");
      }

      const outcome: ApprovalOutcome = { by: "user", optionId: decision.optionId };
      options.events.publish({
        type: "approval.resolved",
        sessionId: approval.sessionId,
        approvalId,
        outcome,
      });
      options.onStatusChange?.(approval.sessionId, "working");
      finishAllow(approval.sessionId, approval.subject, outcome, approval.options);
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
      executeAllows.clearSession(sessionId);
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

    listRules(sessionId: string): PermissionRule[] {
      return options.rules.list(sessionId);
    },

    revokeRule(ruleId: string): PermissionRule {
      const removed = options.rules.revoke(ruleId);
      if (!removed) {
        throw new SterError("not-found", `Unknown rule ${ruleId}`);
      }
      return removed;
    },
  };
}

export type ApprovalBroker = ReturnType<typeof createApprovalBroker>;
