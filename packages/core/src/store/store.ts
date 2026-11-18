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

export interface RunRow {
  id: string;
  sessionId: string;
  kind: string;
  agentId: string;
  cwd: string;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  permissionMode: string;
  model: string | null;
  mode: string | null;
  requestText: string | null;
  payloadJson: string;
}

export interface ScoreRow {
  id: string;
  runId: string;
  source: string;
  value: number;
  scaleMin: number;
  scaleMax: number;
  createdAt: string;
  updatedAt: string;
  payloadJson: string;
}

export interface Store {
  readonly dataDir: string;
  readonly dbPath: string;

  migrationVersion(): number;
  listAppliedMigrations(): number[];

  putSession(row: SessionRow): void;
  getSession(id: string): SessionRow | null;
  listSessions(): SessionRow[];
  deleteSession(id: string): void;

  appendItem(item: NewConversationItem): ConversationItemRow;
  updateItemPayload(sessionId: string, seq: number, payloadJson: string): ConversationItemRow;
  listItems(sessionId: string, page: ItemPage): ConversationItemRow[];

  putRun(row: RunRow): void;
  getRun(id: string): RunRow | null;
  listRuns(): RunRow[];
  deleteRun(id: string): void;
  deleteRunsForSession(sessionId: string): number;
  redactRunRequestsForSession(sessionId: string): number;

  putScore(row: ScoreRow): void;
  getScore(id: string): ScoreRow | null;
  listScoresForRun(runId: string): ScoreRow[];
  deleteScoresForRun(runId: string): void;

  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;

  close(): void;
}
