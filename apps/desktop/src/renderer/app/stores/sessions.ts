export interface SessionCard {
  id: string;
  agentId: string;
  title: string;
  status: string;
  cwd: string;
  lastActivityAt: string;
}

export interface ConversationItemView {
  sessionId: string;
  seq: number;
  kind: string;
  runId: string;
  createdAt: string;
  payload: unknown;
}

export interface ApprovalView {
  id: string;
  sessionId: string;
  runId: string;
  source: "agent" | "client-guard";
  subject: unknown;
  options: Array<{ optionId: string; name: string; kind: string }>;
  requestedAt: string;
}

type Listener = () => void;

let selectedSessionId: string | null = null;
let sessions: SessionCard[] = [];
const itemsBySession = new Map<string, ConversationItemView[]>();
let pendingApproval: ApprovalView | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSessions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedSessionId(): string | null {
  return selectedSessionId;
}

export function getSessions(): SessionCard[] {
  return sessions;
}

export function getItems(sessionId: string): ConversationItemView[] {
  return itemsBySession.get(sessionId) ?? [];
}

export function getPendingApproval(): ApprovalView | null {
  return pendingApproval;
}

export function setSessions(next: SessionCard[]): void {
  sessions = next;
  emit();
}

export function upsertSession(session: SessionCard): void {
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index === -1) {
    sessions = [session, ...sessions];
  } else {
    sessions = sessions.map((s, i) => (i === index ? session : s));
  }
  emit();
}

export function removeSession(sessionId: string): void {
  sessions = sessions.filter((s) => s.id !== sessionId);
  itemsBySession.delete(sessionId);
  if (selectedSessionId === sessionId) {
    selectedSessionId = sessions[0]?.id ?? null;
  }
  if (pendingApproval?.sessionId === sessionId) {
    pendingApproval = null;
  }
  emit();
}

export function selectSession(sessionId: string | null): void {
  selectedSessionId = sessionId;
  emit();
}

export function setItems(sessionId: string, items: ConversationItemView[]): void {
  itemsBySession.set(
    sessionId,
    [...items].sort((a, b) => a.seq - b.seq),
  );
  emit();
}

export function appendItem(item: ConversationItemView): void {
  const existing = itemsBySession.get(item.sessionId) ?? [];
  if (existing.some((i) => i.seq === item.seq)) {
    itemsBySession.set(
      item.sessionId,
      existing.map((i) => (i.seq === item.seq ? item : i)),
    );
  } else {
    itemsBySession.set(
      item.sessionId,
      [...existing, item].sort((a, b) => a.seq - b.seq),
    );
  }
  emit();
}

export function patchItem(sessionId: string, seq: number, patch: Record<string, unknown>): void {
  const existing = itemsBySession.get(sessionId) ?? [];
  itemsBySession.set(
    sessionId,
    existing.map((item) => {
      if (item.seq !== seq) {
        return item;
      }
      const payload =
        patch["payload"] !== undefined
          ? patch["payload"]
          : item.payload && typeof item.payload === "object"
            ? { ...item.payload, ...patch }
            : patch;
      return { ...item, payload };
    }),
  );
  emit();
}

export function setPendingApproval(approval: ApprovalView | null): void {
  pendingApproval = approval;
  emit();
}
