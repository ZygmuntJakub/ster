import { methods, type PromptResponse } from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { connectAgent, type AcpConnection } from "../acp/connection.js";
import { spawnAgentProcess, type AgentProcess } from "../acp/process.js";
import type { AgentService } from "../agents/service.js";
import { SterError } from "../errors.js";
import type { EventStream, CoreEvent } from "../events/stream.js";
import type { Logger } from "../log.js";
import type { ConversationItem, SessionSummary } from "../model/events.js";
import type { ResolvedEnv } from "../platform/shell-env.js";
import {
  finalizeRun,
  outcomeFromStopReason,
  startRun,
  toRunSummary,
  type RunRecord,
} from "../runs/lifecycle.js";
import type { Store } from "../store/store.js";
import { appendConversationItem, listConversationItems } from "./items.js";
import {
  transitionSessionStatus,
  type Session,
  type SessionFilter,
  type SessionStatus,
} from "./session.js";
import { applySessionUpdate, type UpdateHandlerContext } from "./updates.js";

export type PromptContent =
  { type: "text"; text: string } | { type: string; [key: string]: unknown };

export interface PermissionRule {
  id: string;
  sessionId: string;
  pattern: string;
}

export interface AuthMethod {
  id: string;
  name: string;
}

export interface SessionService {
  create(input: { agentId: string; cwd: string; permissionMode?: string }): Promise<Session>;
  list(filter?: SessionFilter): Promise<SessionSummary[]>;
  get(sessionId: string): Promise<Session>;
  items(sessionId: string, page: { before?: number; limit: number }): Promise<ConversationItem[]>;
  prompt(sessionId: string, content: PromptContent[]): Promise<RunRecord>;
  cancel(sessionId: string): Promise<void>;
  resolveApproval(
    approvalId: string,
    outcome: { optionId: string } | { cancelled: true },
  ): Promise<void>;
  setPermissionMode(sessionId: string, mode: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string): Promise<void>;
  rules(sessionId: string): Promise<PermissionRule[]>;
  revokeRule(ruleId: string): Promise<void>;
  killCommand(commandRunId: string): Promise<void>;
  authMethods(sessionId: string): Promise<AuthMethod[]>;
  authenticate(sessionId: string, methodId: string): Promise<void>;
  resume(sessionId: string): Promise<Session>;
  restart(sessionId: string): Promise<Session>;
  rename(sessionId: string, title: string): Promise<void>;
  end(sessionId: string): Promise<void>;
  delete(sessionId: string, opts: { runRecords: "delete" | "keep-without-text" }): Promise<void>;
}

export interface CreateSessionServiceOptions {
  store: Store;
  agents: AgentService;
  events: EventStream<CoreEvent>;
  environment: ResolvedEnv;
  log: Logger;
  defaultPermissionMode?: string;
}

interface LiveSession {
  session: Session;
  process: AgentProcess;
  connection: AcpConnection;
  agentSessionId: string;
  promptInFlight: boolean;
  cancelRequested: boolean;
}

interface SessionPayload {
  agentSessionId?: string;
  failureReason?: string;
}

function assertDirectory(cwd: string): void {
  try {
    const st = statSync(cwd);
    if (!st.isDirectory()) {
      throw new SterError("invalid-argument", "Working folder is not a directory", { cwd });
    }
  } catch (error) {
    if (error instanceof SterError) {
      throw error;
    }
    throw new SterError("invalid-argument", "Working folder is missing or unreadable", {
      cwd,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function toSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.title,
    status: session.status,
    cwd: session.cwd,
    lastActivityAt: session.lastActivityAt,
  };
}

function persist(store: Store, session: Session): void {
  const payload: SessionPayload = {};
  if (session.agentSessionId !== undefined) {
    payload.agentSessionId = session.agentSessionId;
  }
  if (session.failureReason !== undefined) {
    payload.failureReason = session.failureReason;
  }
  store.putSession({
    id: session.id,
    agentId: session.agentId,
    agentVersion: session.agentVersion,
    cwd: session.cwd,
    title: session.title,
    status: session.status,
    permissionMode: session.permissionMode,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    payloadJson: JSON.stringify(payload),
  });
}

function fromRow(row: ReturnType<Store["getSession"]>): Session | null {
  if (!row) {
    return null;
  }
  let payload: SessionPayload = {};
  try {
    payload = JSON.parse(row.payloadJson) as SessionPayload;
  } catch {
    payload = {};
  }
  const session: Session = {
    id: row.id,
    agentId: row.agentId,
    agentVersion: row.agentVersion,
    cwd: row.cwd,
    title: row.title,
    status: row.status as SessionStatus,
    permissionMode: row.permissionMode,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
  };
  if (payload.agentSessionId !== undefined) {
    session.agentSessionId = payload.agentSessionId;
  }
  if (payload.failureReason !== undefined) {
    session.failureReason = payload.failureReason;
  }
  return session;
}

function promptText(content: PromptContent[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export interface SessionServiceHandle {
  service: SessionService;
  /** Kill live agent processes and mark sessions ended. */
  dispose(): Promise<void>;
}

/**
 * SessionService for US1: create, prompt, cancel, end, restart against a live ACP agent.
 */
export function createSessionService(options: CreateSessionServiceOptions): SessionServiceHandle {
  const live = new Map<string, LiveSession>();
  const defaultMode = options.defaultPermissionMode ?? "always-ask";

  const setStatus = (session: Session, next: SessionStatus): void => {
    session.status = transitionSessionStatus(session.status, next);
    session.lastActivityAt = new Date().toISOString();
    persist(options.store, session);
    options.events.publish({
      type: "session.status",
      sessionId: session.id,
      session: toSummary(session),
    });
  };

  const failSession = async (entry: LiveSession, reason: string): Promise<void> => {
    entry.session.failureReason = reason;
    try {
      if (entry.session.status !== "failed" && entry.session.status !== "ended") {
        setStatus(entry.session, "failed");
      } else {
        persist(options.store, entry.session);
      }
    } catch {
      entry.session.status = "failed";
      persist(options.store, entry.session);
    }
    entry.connection.close();
    await entry.process.kill();
    live.delete(entry.session.id);
  };

  const requireLive = (sessionId: string): LiveSession => {
    const entry = live.get(sessionId);
    if (!entry) {
      throw new SterError("not-found", `Session ${sessionId} is not running`);
    }
    return entry;
  };

  const loadOrThrow = (sessionId: string): Session => {
    const session = fromRow(options.store.getSession(sessionId));
    if (!session) {
      throw new SterError("not-found", `Unknown session ${sessionId}`);
    }
    return session;
  };

  const startAgent = async (input: {
    agentId: string;
    cwd: string;
    permissionMode: string;
    existingId?: string;
  }): Promise<LiveSession> => {
    const agent = options.agents.get(input.agentId);
    if (!agent) {
      throw new SterError("not-found", `Unknown agent ${input.agentId}`);
    }
    if (!agent.confirmedAt) {
      throw new SterError("agent-not-confirmed", "Confirm the agent before the first start", {
        agentId: agent.id,
      });
    }
    if (!agent.launch) {
      throw new SterError("agent-not-ready", "Agent has no launch command", { agentId: agent.id });
    }
    assertDirectory(input.cwd);

    const now = new Date().toISOString();
    const session: Session = {
      id: input.existingId ?? randomUUID(),
      agentId: agent.id,
      agentVersion: agent.version ?? "0.0.0",
      cwd: input.cwd,
      title: "New session",
      status: "starting",
      permissionMode: input.permissionMode,
      createdAt: now,
      lastActivityAt: now,
    };
    persist(options.store, session);

    const proc = spawnAgentProcess({
      launch: {
        command: agent.launch.command,
        args: agent.launch.args,
        env: agent.launch.env,
        // Keep the process cwd on the app/repo so module resolution (tsx) works;
        // the ACP session cwd is passed separately via session/new.
      },
      environment: options.environment,
      log: options.log,
    });

    let connection: AcpConnection;
    try {
      connection = await connectAgent({
        process: proc,
        log: options.log,
        clientInfo: { name: "ster", version: "0.0.0" },
      });
    } catch (error) {
      await proc.kill();
      session.failureReason = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      persist(options.store, session);
      throw error;
    }

    const acpSession = await connection.client.buildSession(input.cwd).start();
    session.agentSessionId = acpSession.sessionId;
    session.status = transitionSessionStatus("starting", "idle");
    session.lastActivityAt = new Date().toISOString();
    persist(options.store, session);

    const entry: LiveSession = {
      session,
      process: proc,
      connection,
      agentSessionId: acpSession.sessionId,
      promptInFlight: false,
      cancelRequested: false,
    };
    live.set(session.id, entry);

    void proc.exit.then(async (result) => {
      if (!live.has(session.id)) {
        return;
      }
      options.log.warn("agent exited for session", {
        sessionId: session.id,
        code: result.code,
        signal: result.signal,
      });
      await failSession(entry, `Agent exited (code ${String(result.code)})`);
    });

    options.events.publish({
      type: "session.created",
      sessionId: session.id,
      session: toSummary(session),
    });

    return entry;
  };

  const service: SessionService = {
    async create(input) {
      const mode = input.permissionMode ?? defaultMode;
      const entry = await startAgent({
        agentId: input.agentId,
        cwd: input.cwd,
        permissionMode: mode,
      });
      return { ...entry.session };
    },

    list: (filter) => {
      const summaries = options.store
        .listSessions()
        .map((row) => fromRow(row))
        .filter((session): session is Session => session !== null)
        .filter((session) => {
          if (filter?.agentId !== undefined && session.agentId !== filter.agentId) {
            return false;
          }
          if (filter?.cwd !== undefined && session.cwd !== filter.cwd) {
            return false;
          }
          if (filter?.status !== undefined && session.status !== filter.status) {
            return false;
          }
          return true;
        })
        .map(toSummary);
      return Promise.resolve(summaries);
    },

    get: (sessionId) => {
      const liveEntry = live.get(sessionId);
      if (liveEntry) {
        return Promise.resolve({ ...liveEntry.session });
      }
      return Promise.resolve({ ...loadOrThrow(sessionId) });
    },

    items: (sessionId, page) => {
      loadOrThrow(sessionId);
      return Promise.resolve(listConversationItems(options.store, sessionId, page));
    },

    async prompt(sessionId, content) {
      const entry = requireLive(sessionId);
      if (entry.promptInFlight) {
        throw new SterError("invalid-argument", "A prompt is already in flight");
      }
      if (entry.session.status !== "idle") {
        throw new SterError("invalid-argument", `Session is ${entry.session.status}`);
      }

      const text = promptText(content);
      const run = startRun({ sessionId, request: text });
      entry.promptInFlight = true;
      entry.cancelRequested = false;
      setStatus(entry.session, "working");
      options.events.publish({
        type: "run.started",
        sessionId,
        run: toRunSummary(run),
      });

      const userItem = appendConversationItem(options.store, {
        sessionId,
        kind: "user-message",
        runId: run.id,
        payload: { content },
      });
      options.events.publish({
        type: "item.appended",
        sessionId,
        item: userItem,
      });

      let updateCtx: UpdateHandlerContext = {
        store: options.store,
        events: options.events,
        session: entry.session,
        runId: run.id,
        streaming: null,
        setTitle: (title) => {
          entry.session.title = title;
          entry.session.lastActivityAt = new Date().toISOString();
          persist(options.store, entry.session);
          options.events.publish({
            type: "session.updated",
            sessionId,
            session: toSummary(entry.session),
          });
        },
      };

      const unsubscribe = entry.connection.onSessionUpdate(entry.agentSessionId, (notification) => {
        updateCtx = applySessionUpdate(updateCtx, notification);
      });

      let response: PromptResponse;
      try {
        response = await entry.connection.client.request(methods.agent.session.prompt, {
          sessionId: entry.agentSessionId,
          prompt: content.map((block) => {
            if (block.type === "text") {
              return { type: "text" as const, text: block.text };
            }
            return block as { type: "text"; text: string };
          }),
        });
      } catch (error) {
        unsubscribe();
        entry.promptInFlight = false;
        const message = error instanceof Error ? error.message : String(error);
        const failed = finalizeRun(run, {
          outcome: "failed",
          error: message,
          stopReason: "error",
        });
        if (live.has(sessionId)) {
          await failSession(entry, message);
        }
        options.events.publish({
          type: "run.finished",
          sessionId,
          run: toRunSummary(failed),
        });
        return failed;
      }

      await entry.connection.flushSessionUpdates(entry.agentSessionId);
      unsubscribe();
      entry.promptInFlight = false;

      if (!live.has(sessionId)) {
        const failed = finalizeRun(run, {
          outcome: "failed",
          stopReason: response.stopReason,
          error: entry.session.failureReason ?? "agent-exited",
        });
        options.events.publish({
          type: "run.finished",
          sessionId,
          run: toRunSummary(failed),
        });
        return failed;
      }

      // cancelRequested is mutated by cancel() while prompt awaits; read via binding.
      const cancelRequested = entry.cancelRequested as boolean;
      const outcome = cancelRequested ? "cancelled" : outcomeFromStopReason(response.stopReason);
      const finished = finalizeRun(run, {
        outcome,
        stopReason: response.stopReason,
      });
      const status = entry.session.status as SessionStatus;
      if (status === "working" || status === "waiting-approval") {
        setStatus(entry.session, "idle");
      }
      options.events.publish({
        type: "run.finished",
        sessionId,
        run: toRunSummary(finished),
      });
      return finished;
    },

    async cancel(sessionId) {
      const entry = requireLive(sessionId);
      entry.cancelRequested = true;
      await entry.connection.client.notify(methods.agent.session.cancel, {
        sessionId: entry.agentSessionId,
      });
    },

    resolveApproval: () =>
      Promise.reject(new SterError("invalid-argument", "Approvals arrive in T046")),
    setPermissionMode: () =>
      Promise.reject(new SterError("invalid-argument", "Permission modes arrive in US3")),
    setConfigOption: () =>
      Promise.reject(new SterError("invalid-argument", "Config options arrive later in US1/US6")),
    rules: () => Promise.resolve([]),
    revokeRule: () => Promise.reject(new SterError("invalid-argument", "Rules arrive in US3")),
    killCommand: () => Promise.reject(new SterError("invalid-argument", "Commands arrive in US5")),
    authMethods: (sessionId) => {
      const entry = live.get(sessionId);
      if (entry) {
        return Promise.resolve(
          entry.connection.capabilities.authMethods.map((m) => ({
            id: m.id,
            name: m.name || m.id,
          })),
        );
      }
      loadOrThrow(sessionId);
      return Promise.resolve([]);
    },
    authenticate: () =>
      Promise.reject(new SterError("invalid-argument", "Authenticate arrives in T050")),
    resume: () => Promise.reject(new SterError("not-resumable", "Resume arrives later")),

    async restart(sessionId) {
      const session = loadOrThrow(sessionId);
      if (session.status !== "failed") {
        throw new SterError("invalid-argument", "Only failed sessions can be restarted");
      }
      const existing = live.get(sessionId);
      if (existing) {
        existing.connection.close();
        await existing.process.kill();
        live.delete(sessionId);
      }
      session.status = "starting";
      delete session.failureReason;
      persist(options.store, session);
      const entry = await startAgent({
        agentId: session.agentId,
        cwd: session.cwd,
        permissionMode: session.permissionMode,
        existingId: session.id,
      });
      return { ...entry.session };
    },

    rename: (sessionId, title) => {
      const session = live.get(sessionId)?.session ?? loadOrThrow(sessionId);
      session.title = title;
      session.lastActivityAt = new Date().toISOString();
      persist(options.store, session);
      options.events.publish({
        type: "session.updated",
        sessionId,
        session: toSummary(session),
      });
      return Promise.resolve();
    },

    async end(sessionId) {
      const entry = live.get(sessionId);
      const session = entry?.session ?? loadOrThrow(sessionId);
      if (session.status !== "ended") {
        try {
          setStatus(session, "ended");
        } catch {
          session.status = "ended";
          persist(options.store, session);
        }
      }
      if (entry) {
        try {
          await entry.connection.client.request(methods.agent.session.close, {
            sessionId: entry.agentSessionId,
          });
        } catch {
          // Agent may already be gone.
        }
        entry.connection.close();
        await entry.process.kill();
        live.delete(sessionId);
      }
      options.events.publish({
        type: "session.deleted",
        sessionId,
        session: toSummary(session),
      });
    },

    async delete(sessionId) {
      await service.end(sessionId);
      options.store.deleteSession(sessionId);
    },
  };

  return {
    service,
    async dispose() {
      const ids = [...live.keys()];
      for (const id of ids) {
        try {
          await service.end(id);
        } catch (error) {
          options.log.warn("session dispose failed", {
            sessionId: id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
  };
}
