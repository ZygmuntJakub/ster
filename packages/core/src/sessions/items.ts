import type { ConversationItem } from "../model/events.js";
import type { NewConversationItem, Store } from "../store/store.js";

export type ConversationItemKind =
  | "user-message"
  | "agent-message"
  | "agent-thought"
  | "action"
  | "plan"
  | "approval"
  | "command-run"
  | "notice"
  | "unknown";

export interface AppendItemInput {
  sessionId: string;
  kind: ConversationItemKind;
  runId: string;
  payload: unknown;
  createdAt?: string;
}

function rowToItem(row: {
  sessionId: string;
  seq: number;
  kind: string;
  runId: string;
  createdAt: string;
  payloadJson: string;
}): ConversationItem {
  return {
    sessionId: row.sessionId,
    seq: row.seq,
    kind: row.kind,
    runId: row.runId,
    createdAt: row.createdAt,
    payload: JSON.parse(row.payloadJson) as unknown,
  };
}

/**
 * Append a conversation item and return the domain shape.
 */
export function appendConversationItem(store: Store, input: AppendItemInput): ConversationItem {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const row: NewConversationItem = {
    sessionId: input.sessionId,
    kind: input.kind,
    runId: input.runId,
    createdAt,
    payloadJson: JSON.stringify(input.payload),
  };
  return rowToItem(store.appendItem(row));
}

/**
 * Replace the payload of an existing item (streaming text, action status).
 */
export function updateConversationItemPayload(
  store: Store,
  sessionId: string,
  seq: number,
  payload: unknown,
): ConversationItem {
  return rowToItem(store.updateItemPayload(sessionId, seq, JSON.stringify(payload)));
}

/**
 * Page conversation items (newer-first when `before` is set; otherwise oldest-first up to limit).
 */
export function listConversationItems(
  store: Store,
  sessionId: string,
  page: { before?: number; limit: number },
): ConversationItem[] {
  const itemPage =
    page.before === undefined ? { limit: page.limit } : { before: page.before, limit: page.limit };
  const rows = store.listItems(sessionId, itemPage);
  // Store returns newer-first for before-paging; for the initial page without before,
  // return chronological order for the conversation view.
  const items = rows.map(rowToItem);
  if (page.before === undefined) {
    return items.slice().reverse();
  }
  return items;
}
