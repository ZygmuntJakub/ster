/**
 * Persistence boundary for the core. Implementations must keep data readable
 * only by the user's account (research.md R10, FR-057).
 */

export interface SessionRow {
  id: string;
  agentId: string;
  agentVersion: string;
  cwd: string;
  title: string;
  status: string;
  permissionMode: string;
  createdAt: string;
  lastActivityAt: string;
  payloadJson: string;
}

export interface ConversationItemRow {
  sessionId: string;
  seq: number;
  kind: string;
  runId: string;
  createdAt: string;
  payloadJson: string;
}

export interface NewConversationItem {
  sessionId: string;
  kind: string;
  runId: string;
  createdAt: string;
  payloadJson: string;
  /** When omitted, the store allocates the next seq for the session. */
  seq?: number;
}

export interface ItemPage {
  /** Return items with seq strictly less than this value (newer-first paging). */
  before?: number;
  limit: number;
}

export interface Store {
  readonly dataDir: string;
  readonly dbPath: string;

  migrationVersion(): number;
  listAppliedMigrations(): number[];

  putSession(row: SessionRow): void;
  getSession(id: string): SessionRow | null;
  deleteSession(id: string): void;

  appendItem(item: NewConversationItem): ConversationItemRow;
  updateItemPayload(sessionId: string, seq: number, payloadJson: string): ConversationItemRow;
  listItems(sessionId: string, page: ItemPage): ConversationItemRow[];

  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;

  close(): void;
}
