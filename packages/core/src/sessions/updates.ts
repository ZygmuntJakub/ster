import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { EventStream } from "../events/stream.js";
import type { RunUsage } from "../runs/lifecycle.js";
import type { Store } from "../store/store.js";
import { actionFromUpdate, mergeActionUpdate, type AgentAction } from "./actions.js";
import {
  applyCurrentModeUpdate,
  normalizeAvailableCommands,
  normalizeConfigOptions,
  type AvailableCommandInfo,
  type ConfigOption,
} from "./config-options.js";
import {
  appendConversationItem,
  updateConversationItemPayload,
  type ConversationItemKind,
} from "./items.js";
import { planFromUpdate } from "./plan.js";
import type { Session } from "./session.js";

export interface StreamingState {
  kind: "agent-message" | "agent-thought";
  seq: number;
  messageId?: string;
  text: string;
}

export interface UpdateHandlerContext {
  store: Store;
  events: EventStream<import("../events/stream.js").CoreEvent>;
  session: Session;
  runId: string;
  streaming: StreamingState | null;
  /** toolCallId → conversation item seq for in-place action merges. */
  actionsById: Map<string, number>;
  /** Seq of the latest plan item for this turn (replaced in place). */
  planSeq: number | null;
  setTitle?: (title: string) => void;
  setConfigOptions?: (options: ConfigOption[]) => void;
  setAvailableCommands?: (commands: AvailableCommandInfo[]) => void;
  onAction?: (action: AgentAction) => void;
  onUsage?: (usage: RunUsage) => void;
}

function textFromContent(content: unknown): string {
  if (
    content !== null &&
    typeof content === "object" &&
    "type" in content &&
    (content as { type: string }).type === "text" &&
    "text" in content &&
    typeof (content as { text: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }
  return "";
}

function publishItemAppended(
  ctx: UpdateHandlerContext,
  item: import("../model/events.js").ConversationItem,
): void {
  ctx.events.publish({
    type: "item.appended",
    sessionId: ctx.session.id,
    item,
  });
}

function publishItemUpdated(
  ctx: UpdateHandlerContext,
  seq: number,
  patch: Record<string, unknown>,
): void {
  ctx.events.publish({
    type: "item.updated",
    sessionId: ctx.session.id,
    seq,
    patch,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Map a `session/update` notification to conversation items.
 * Handles messages, thoughts, actions, plans, session info, and unknown variants.
 */
export function applySessionUpdate(
  ctx: UpdateHandlerContext,
  notification: SessionNotification,
): UpdateHandlerContext {
  const update = notification.update;
  const kind = update.sessionUpdate;

  if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
    const itemKind: ConversationItemKind =
      kind === "agent_message_chunk" ? "agent-message" : "agent-thought";
    const streamKind = itemKind === "agent-message" ? "agent-message" : "agent-thought";
    const chunkText = textFromContent(update.content);
    const messageId =
      "messageId" in update && typeof update.messageId === "string" ? update.messageId : undefined;

    const sameStream =
      ctx.streaming !== null &&
      ctx.streaming.kind === streamKind &&
      (messageId === undefined ||
        ctx.streaming.messageId === undefined ||
        ctx.streaming.messageId === messageId);

    if (sameStream && ctx.streaming) {
      const text = ctx.streaming.text + chunkText;
      const payload = { text };
      updateConversationItemPayload(ctx.store, ctx.session.id, ctx.streaming.seq, payload);
      publishItemUpdated(ctx, ctx.streaming.seq, { text });
      return {
        ...ctx,
        streaming: {
          ...ctx.streaming,
          text,
          ...(messageId !== undefined ? { messageId } : {}),
        },
      };
    }

    const item = appendConversationItem(ctx.store, {
      sessionId: ctx.session.id,
      kind: itemKind,
      runId: ctx.runId,
      payload: { text: chunkText },
    });
    publishItemAppended(ctx, item);
    return {
      ...ctx,
      streaming: {
        kind: streamKind,
        seq: item.seq,
        text: chunkText,
        ...(messageId !== undefined ? { messageId } : {}),
      },
    };
  }

  if (kind === "tool_call" || kind === "tool_call_update") {
    const record = asRecord(update);
    const incoming = actionFromUpdate(record);
    if (!incoming) {
      return { ...ctx, streaming: null };
    }

    const existingSeq = ctx.actionsById.get(incoming.toolCallId);
    if (existingSeq !== undefined) {
      const rows = ctx.store.listItems(ctx.session.id, { limit: 500 });
      const row = rows.find((r) => r.seq === existingSeq);
      const currentPayload = row ? (JSON.parse(row.payloadJson) as AgentAction) : incoming;
      const merged =
        kind === "tool_call_update" ? mergeActionUpdate(currentPayload, record) : incoming;
      updateConversationItemPayload(ctx.store, ctx.session.id, existingSeq, merged);
      publishItemUpdated(ctx, existingSeq, { payload: merged, kind: "action" });
      ctx.onAction?.(merged);
      return { ...ctx, streaming: null };
    }

    const item = appendConversationItem(ctx.store, {
      sessionId: ctx.session.id,
      kind: "action",
      runId: ctx.runId,
      payload: incoming,
    });
    const actionsById = new Map(ctx.actionsById);
    actionsById.set(incoming.toolCallId, item.seq);
    publishItemAppended(ctx, item);
    ctx.onAction?.(incoming);
    return { ...ctx, streaming: null, actionsById };
  }

  if (kind === "usage_update") {
    const record = asRecord(update);
    const usage: RunUsage = {};
    if (typeof record["used"] === "number") {
      usage.contextUsed = record["used"];
    } else if (typeof record["contextUsed"] === "number") {
      usage.contextUsed = record["contextUsed"];
    }
    if (typeof record["size"] === "number") {
      usage.contextSize = record["size"];
    } else if (typeof record["contextSize"] === "number") {
      usage.contextSize = record["contextSize"];
    }
    const cost = record["cost"];
    if (
      cost &&
      typeof cost === "object" &&
      typeof (cost as { amount?: unknown }).amount === "number" &&
      typeof (cost as { currency?: unknown }).currency === "string"
    ) {
      usage.cost = {
        amount: (cost as { amount: number }).amount,
        currency: (cost as { currency: string }).currency,
      };
    }
    ctx.onUsage?.(usage);
    return { ...ctx, streaming: null };
  }

  if (kind === "plan") {
    const payload = planFromUpdate(asRecord(update));
    if (ctx.planSeq !== null) {
      updateConversationItemPayload(ctx.store, ctx.session.id, ctx.planSeq, payload);
      publishItemUpdated(ctx, ctx.planSeq, { payload, kind: "plan" });
      return { ...ctx, streaming: null };
    }
    const item = appendConversationItem(ctx.store, {
      sessionId: ctx.session.id,
      kind: "plan",
      runId: ctx.runId,
      payload,
    });
    publishItemAppended(ctx, item);
    return { ...ctx, streaming: null, planSeq: item.seq };
  }

  if (kind === "session_info_update") {
    const title = "title" in update && typeof update.title === "string" ? update.title : undefined;
    if (title !== undefined && ctx.setTitle) {
      ctx.setTitle(title);
    }
    return { ...ctx, streaming: null };
  }

  if (kind === "config_option_update") {
    const options = normalizeConfigOptions(
      "configOptions" in update ? update.configOptions : undefined,
    );
    ctx.setConfigOptions?.(options);
    return { ...ctx, streaming: null };
  }

  if (kind === "current_mode_update") {
    const modeId =
      "currentModeId" in update && typeof update.currentModeId === "string"
        ? update.currentModeId
        : undefined;
    if (modeId !== undefined) {
      const next = applyCurrentModeUpdate(ctx.session.configOptions ?? [], modeId);
      ctx.setConfigOptions?.(next);
    }
    return { ...ctx, streaming: null };
  }

  if (kind === "available_commands_update") {
    const commands = normalizeAvailableCommands(
      "availableCommands" in update ? update.availableCommands : undefined,
    );
    ctx.setAvailableCommands?.(commands);
    return { ...ctx, streaming: null };
  }

  const item = appendConversationItem(ctx.store, {
    sessionId: ctx.session.id,
    kind: kind === "notice" ? "notice" : "unknown",
    runId: ctx.runId,
    payload: { sessionUpdate: kind, raw: update },
  });
  publishItemAppended(ctx, item);
  return { ...ctx, streaming: null };
}
