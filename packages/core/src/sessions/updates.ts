import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { EventStream } from "../events/stream.js";
import type { Store } from "../store/store.js";
import {
  appendConversationItem,
  updateConversationItemPayload,
  type ConversationItemKind,
} from "./items.js";
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
  setTitle?: (title: string) => void;
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

/**
 * Map a `session/update` notification to conversation items (US1 subset).
 * Handles message chunks, thought chunks, session info, and unknown variants.
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

  if (kind === "session_info_update") {
    const title = "title" in update && typeof update.title === "string" ? update.title : undefined;
    if (title !== undefined && ctx.setTitle) {
      ctx.setTitle(title);
    }
    return { ...ctx, streaming: null };
  }

  // US1: other variants (tool_call, plan, …) stored as placeholders until US2+.
  const item = appendConversationItem(ctx.store, {
    sessionId: ctx.session.id,
    kind: kind === "notice" ? "notice" : "unknown",
    runId: ctx.runId,
    payload: { sessionUpdate: kind, raw: update },
  });
  publishItemAppended(ctx, item);
  return { ...ctx, streaming: null };
}
