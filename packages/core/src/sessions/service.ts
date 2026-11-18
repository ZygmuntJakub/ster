import {
  methods,
  type PromptResponse,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import {
  connectAgent,
  type AcpConnection,
  type ConnectAgentClientHandlers,
} from "../acp/connection.js";
import { spawnAgentProcess, type AgentProcess } from "../acp/process.js";
import type { AgentService } from "../agents/service.js";
import { SterError } from "../errors.js";
import type { EventStream, CoreEvent } from "../events/stream.js";
import type { Logger } from "../log.js";
import type { ConversationItem, SessionSummary } from "../model/events.js";
import type { PermissionModeDefinition } from "../extensions/index.js";
import { createApprovalBroker } from "../permissions/approvals.js";
import {
  classifyFsPath,
  OUTSIDE_WORKSPACE_OPTIONS,
  readAbsoluteTextFile,
  writeAbsoluteTextFile,
} from "../permissions/guard.js";
import { isBuiltinPermissionMode, BUILTIN_PERMISSION_MODES } from "../permissions/modes.js";
import { createRuleStore, type PermissionRule } from "../permissions/rules.js";
import type { ResolvedEnv } from "../platform/shell-env.js";
import {
  finalizeRun,
  outcomeFromStopReason,
  startRun,
  toRunSummary,
  type RunRecord,
} from "../runs/lifecycle.js";
import type { Store } from "../store/store.js";
import { assertWorkspaceAvailable } from "../workspace/availability.js";
import { readWorkspaceTextFile, writeWorkspaceTextFile } from "../workspace/files.js";
import { createSnapshotStore } from "../workspace/snapshots.js";
import {
  describeTerminalLogin as buildTerminalLoginPlan,
  isAuthRequiredError,
  toAuthMethodInfo,
  type AuthMethodInfo,
  type TerminalLoginPlan,
} from "./auth.js";
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

export type { PermissionRule };
export type AuthMethod = AuthMethodInfo;
export type { TerminalLoginPlan };

function isSelectedAllow(
  outcome: { by: string; optionId?: string },
  allowOptionId = "allow",
): boolean {
  return (
    (outcome.by === "user" || outcome.by === "rule" || outcome.by === "mode") &&
    outcome.optionId === allowOptionId
  );
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
  /** Describe the relaunch command for a terminal auth method (research.md R3). */
  describeTerminalLogin(sessionId: string, methodId: string): Promise<TerminalLoginPlan>;
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
  permissionModes?: ReadonlyArray<PermissionModeDefinition>;
}

interface LiveSession {
  session: Session;
  process: AgentProcess;
  connection: AcpConnection;
  agentSessionId: string;
  promptInFlight: boolean;
  cancelRequested: boolean;
  currentRunId?: string;
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
const STALE_WRITE_OPTIONS = [
  { optionId: "allow", name: "Overwrite", kind: "allow_once" },
  { optionId: "reject", name: "Cancel", kind: "reject_once" },
] as const;

export function createSessionService(options: CreateSessionServiceOptions): SessionServiceHandle {
  const live = new Map<string, LiveSession>();
  const snapshots = createSnapshotStore();
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

  const rules = createRuleStore();
  const approvals = createApprovalBroker({
    store: options.store,
    events: options.events,
    currentRunId: (sessionId) => live.get(sessionId)?.currentRunId,
    getPermissionMode: (sessionId) =>
      live.get(sessionId)?.session.permissionMode ??
      options.store.getSession(sessionId)?.permissionMode ??
      defaultMode,
    getSessionCwd: (sessionId) =>
      live.get(sessionId)?.session.cwd ?? options.store.getSession(sessionId)?.cwd,
    rules,
    permissionModes: options.permissionModes ?? BUILTIN_PERMISSION_MODES,
    onStatusChange: (sessionId, status) => {
      const entry = live.get(sessionId);
      if (!entry || entry.session.status === status) {
        return;
      }
      try {
        setStatus(entry.session, status);
      } catch {
        // Ignore illegal transitions during teardown.
      }
    },
  });

  const failSession = async (entry: LiveSession, reason: string): Promise<void> => {
    approvals.cancelSession(entry.session.id);
    snapshots.clearSession(entry.session.id);
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

  const findByAgentSession = (agentSessionId: string): LiveSession | undefined => {
    for (const entry of live.values()) {
      if (entry.agentSessionId === agentSessionId) {
        return entry;
      }
    }
    return undefined;
  };

  const ensureWorkspaceOrFail = (entry: LiveSession): void => {
    try {
      assertWorkspaceAvailable(entry.session.cwd);
    } catch (error) {
      const reason =
        error instanceof SterError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      void failSession(entry, reason);
      throw error instanceof SterError
        ? error
        : new SterError("invalid-argument", reason, { cwd: entry.session.cwd });
    }
  };

  const buildClientHandlers = (): ConnectAgentClientHandlers => ({
    async requestPermission(params): Promise<RequestPermissionResponse> {
      const entry = findByAgentSession(params.sessionId);
      if (!entry) {
        return { outcome: { outcome: "cancelled" } };
      }
      const outcome = await approvals.request({
        sessionId: entry.session.id,
        source: "agent",
        subject: params.toolCall,
        options: params.options,
        toolCallId: params.toolCall.toolCallId,
      });
      if (outcome.by === "user" || outcome.by === "rule" || outcome.by === "mode") {
        return { outcome: { outcome: "selected", optionId: outcome.optionId } };
      }
      return { outcome: { outcome: "cancelled" } };
    },

    async readTextFile(params) {
      await Promise.resolve();
      const entry = findByAgentSession(params.sessionId);
      if (!entry) {
        throw new SterError("not-found", "No live session for file read");
      }
      ensureWorkspaceOrFail(entry);
      const readOpts: { line?: number | null; limit?: number | null } = {};
      if (params.line !== undefined) {
        readOpts.line = params.line;
      }
      if (params.limit !== undefined) {
        readOpts.limit = params.limit;
      }

      const classified = classifyFsPath(entry.session.cwd, params.path);
      if (classified.status === "outside") {
        const outcome = await approvals.request({
          sessionId: entry.session.id,
          source: "client-guard",
          subject: {
            reason: "outside-workspace",
            path: params.path,
            absolutePath: classified.absolutePath,
          },
          options: OUTSIDE_WORKSPACE_OPTIONS,
        });
        if (!isSelectedAllow(outcome)) {
          throw new SterError("outside-workspace", "Path is outside the working folder", {
            path: params.path,
          });
        }
        const { content, resolvedPath } = readAbsoluteTextFile(classified.absolutePath, readOpts);
        snapshots.record(entry.session.id, resolvedPath, content);
        return { content };
      }

      const { content, resolvedPath } = readWorkspaceTextFile(
        entry.session.cwd,
        params.path,
        readOpts,
      );
      snapshots.record(entry.session.id, resolvedPath, content);
      return { content };
    },

    async writeTextFile(params) {
      const entry = findByAgentSession(params.sessionId);
      if (!entry) {
        throw new SterError("not-found", "No live session for file write");
      }
      ensureWorkspaceOrFail(entry);

      const classified = classifyFsPath(entry.session.cwd, params.path);
      if (classified.status === "outside") {
        const outcome = await approvals.request({
          sessionId: entry.session.id,
          source: "client-guard",
          subject: {
            reason: "outside-workspace",
            path: params.path,
            absolutePath: classified.absolutePath,
          },
          options: OUTSIDE_WORKSPACE_OPTIONS,
        });
        if (!isSelectedAllow(outcome)) {
          throw new SterError("outside-workspace", "Path is outside the working folder", {
            path: params.path,
          });
        }
        const { resolvedPath } = writeAbsoluteTextFile(classified.absolutePath, params.content);
        snapshots.record(entry.session.id, resolvedPath, params.content);
        return {};
      }

      const resolvedForCheck = classified.resolvedPath;
      if (snapshots.isStale(entry.session.id, resolvedForCheck)) {
        const outcome = await approvals.request({
          sessionId: entry.session.id,
          source: "client-guard",
          subject: {
            reason: "stale-write",
            path: params.path,
            resolvedPath: resolvedForCheck,
          },
          options: STALE_WRITE_OPTIONS,
        });
        if (!isSelectedAllow(outcome)) {
          throw new SterError("invalid-argument", "Stale write rejected", {
            path: params.path,
          });
        }
      }

      const { resolvedPath } = writeWorkspaceTextFile(
        entry.session.cwd,
        params.path,
        params.content,
      );
      snapshots.record(entry.session.id, resolvedPath, params.content);
      return {};
    },
  });

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
        handlers: buildClientHandlers(),
      });
    } catch (error) {
      await proc.kill();
      session.failureReason = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      persist(options.store, session);
      throw error;
    }

    const entry: LiveSession = {
      session,
      process: proc,
      connection,
      agentSessionId: "",
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

    try {
      const acpSession = await connection.client.buildSession(input.cwd).start();
      session.agentSessionId = acpSession.sessionId;
      entry.agentSessionId = acpSession.sessionId;
      session.status = transitionSessionStatus("starting", "idle");
      session.lastActivityAt = new Date().toISOString();
      persist(options.store, session);
    } catch (error) {
      if (isAuthRequiredError(error)) {
        session.status = transitionSessionStatus("starting", "needs-login");
        session.lastActivityAt = new Date().toISOString();
        persist(options.store, session);
      } else {
        live.delete(session.id);
        connection.close();
        await proc.kill();
        session.failureReason = error instanceof Error ? error.message : String(error);
        session.status = "failed";
        persist(options.store, session);
        throw error;
      }
    }

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
      if (entry.session.status === "needs-login") {
        throw new SterError("login-required", "Session requires login before prompting");
      }
      if (entry.session.status !== "idle") {
        throw new SterError("invalid-argument", `Session is ${entry.session.status}`);
      }
      if (!entry.agentSessionId) {
        throw new SterError("invalid-argument", "Session has no agent session yet");
      }
      ensureWorkspaceOrFail(entry);

      const text = promptText(content);
      const run = startRun({ sessionId, request: text });
      entry.promptInFlight = true;
      entry.cancelRequested = false;
      entry.currentRunId = run.id;
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
        actionsById: new Map(),
        planSeq: null,
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
        delete entry.currentRunId;
        approvals.cancelSession(sessionId);
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
      delete entry.currentRunId;

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
      approvals.cancelSession(sessionId);
      if (entry.agentSessionId) {
        await entry.connection.client.notify(methods.agent.session.cancel, {
          sessionId: entry.agentSessionId,
        });
      }
    },

    resolveApproval: (approvalId, outcome) => {
      approvals.resolve(approvalId, outcome);
      return Promise.resolve();
    },
    setPermissionMode: (sessionId, mode) => {
      const known =
        isBuiltinPermissionMode(mode) ||
        (options.permissionModes ?? []).some((definition) => definition.id === mode);
      if (!known) {
        throw new SterError("invalid-argument", `Unknown permission mode ${mode}`, { mode });
      }
      const session = live.get(sessionId)?.session ?? loadOrThrow(sessionId);
      session.permissionMode = mode;
      session.lastActivityAt = new Date().toISOString();
      persist(options.store, session);
      options.events.publish({
        type: "session.updated",
        sessionId,
        session: toSummary(session),
      });
      return Promise.resolve();
    },
    setConfigOption: () =>
      Promise.reject(new SterError("invalid-argument", "Config options arrive later in US1/US6")),
    rules: (sessionId) => {
      loadOrThrow(sessionId);
      return Promise.resolve(approvals.listRules(sessionId));
    },
    revokeRule: (ruleId) => {
      approvals.revokeRule(ruleId);
      return Promise.resolve();
    },
    killCommand: () => Promise.reject(new SterError("invalid-argument", "Commands arrive in US5")),
    authMethods: (sessionId) => {
      const entry = live.get(sessionId);
      if (entry) {
        return Promise.resolve(entry.connection.capabilities.authMethods.map(toAuthMethodInfo));
      }
      loadOrThrow(sessionId);
      return Promise.resolve([]);
    },
    async authenticate(sessionId, methodId) {
      const entry = requireLive(sessionId);
      if (entry.session.status !== "needs-login") {
        throw new SterError("invalid-argument", "Session is not waiting for login");
      }
      const methodsList = entry.connection.capabilities.authMethods.map(toAuthMethodInfo);
      const method = methodsList.find((m) => m.id === methodId);
      if (!method) {
        throw new SterError("not-found", `Unknown auth method ${methodId}`);
      }
      if (method.type === "terminal") {
        throw new SterError(
          "invalid-argument",
          "Terminal auth methods must use the login terminal relaunch path",
          { methodId },
        );
      }
      setStatus(entry.session, "starting");
      try {
        await entry.connection.client.request(methods.agent.authenticate, { methodId });
        const acpSession = await entry.connection.client.buildSession(entry.session.cwd).start();
        entry.agentSessionId = acpSession.sessionId;
        entry.session.agentSessionId = acpSession.sessionId;
        setStatus(entry.session, "idle");
      } catch (error) {
        if (isAuthRequiredError(error)) {
          setStatus(entry.session, "needs-login");
          throw new SterError("login-required", "Authentication did not complete", {
            methodId,
          });
        }
        const message = error instanceof Error ? error.message : String(error);
        await failSession(entry, message);
        throw error;
      }
    },
    async describeTerminalLogin(sessionId, methodId) {
      await Promise.resolve();
      const entry = requireLive(sessionId);
      const agent = options.agents.get(entry.session.agentId);
      if (!agent?.launch) {
        throw new SterError("agent-not-ready", "Agent has no launch command");
      }
      const methodsList = entry.connection.capabilities.authMethods.map(toAuthMethodInfo);
      const method = methodsList.find((m) => m.id === methodId);
      if (!method) {
        throw new SterError("not-found", `Unknown auth method ${methodId}`);
      }
      return buildTerminalLoginPlan(agent.launch, method);
    },
    resume: () => Promise.reject(new SterError("not-resumable", "Resume arrives later")),

    async restart(sessionId) {
      const session = loadOrThrow(sessionId);
      if (session.status !== "failed" && session.status !== "needs-login") {
        throw new SterError(
          "invalid-argument",
          "Only failed or needs-login sessions can be restarted",
        );
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
      approvals.cancelSession(sessionId);
      rules.clearSession(sessionId);
      snapshots.clearSession(sessionId);
      if (session.status !== "ended") {
        try {
          setStatus(session, "ended");
        } catch {
          session.status = "ended";
          persist(options.store, session);
        }
      }
      if (entry) {
        if (entry.agentSessionId) {
          try {
            await entry.connection.client.request(methods.agent.session.close, {
              sessionId: entry.agentSessionId,
            });
          } catch {
            // Agent may already be gone.
          }
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
