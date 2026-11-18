import { attachEventConsumers } from "./events/consumers.js";
import { createEventStream, type CoreEvent, type EventStream } from "./events/stream.js";
import { SterError } from "./errors.js";
import { indexById, indexPolicyItems, type CoreExtensions } from "./extensions/index.js";
import { createLogger, type Logger } from "./log.js";
import type { Brand } from "./brand.js";
import type { RegistryStatus } from "./model/events.js";
import { createPolicyService, type PolicyService, type PolicySource } from "./policy/service.js";
import { resolveShellEnv, type ResolvedEnv } from "./platform/shell-env.js";
import { createSettingsService, type SettingsService } from "./settings/service.js";
import { openSqliteStore } from "./store/sqlite.js";
import type { Store } from "./store/store.js";

/**
 * Executable-name hints for detecting installed agents (research.md R8).
 * Keys are agent ids; values are candidate binary names on PATH.
 */
export type AgentHints = Readonly<Record<string, readonly string[]>>;

/**
 * Host-provided platform hooks. The core never opens URLs or terminals itself.
 */
export interface PlatformAdapter {
  openExternal(url: string): Promise<void>;
  openTerminal?(cwd: string): Promise<void>;
}

/** Minimal Agent shape until T040 fills the model. */
export interface Agent {
  id: string;
  name: string;
  origin: "registry" | "detected" | "custom";
  readiness: string;
  version?: string;
  launch?: { command: string; args: string[]; env: Record<string, string> };
  confirmedAt?: string;
}

export interface IconData {
  mimeType: string;
  data: Uint8Array;
}

export interface InstallPlan {
  agentId: string;
  version: string;
  source: string;
  verified: boolean;
}

export interface Progress {
  phase: string;
  fraction?: number;
  message?: string;
}

export interface CustomAgentInput {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  id?: string;
}

export interface AgentService {
  list(): Promise<Agent[]>;
  icon(agentId: string): Promise<IconData | null>;
  refreshRegistry(opts?: { force?: boolean }): Promise<RegistryStatus>;
  planInstall(agentId: string): Promise<InstallPlan>;
  install(plan: InstallPlan, onProgress?: (p: Progress) => void): Promise<Agent>;
  remove(agentId: string): Promise<void>;
  saveCustom(def: CustomAgentInput): Promise<Agent>;
  deleteCustom(agentId: string): Promise<void>;
  confirmFirstStart(agentId: string): Promise<void>;
}

/** Minimal Session shape until T045 fills the model. */
export interface Session {
  id: string;
  agentId: string;
  cwd: string;
  title: string;
  status: string;
  permissionMode: string;
}

export interface SessionFilter {
  agentId?: string;
  cwd?: string;
  status?: string;
}

export type PromptContent =
  { type: "text"; text: string } | { type: string; [key: string]: unknown };

export interface RunRecord {
  id: string;
  sessionId: string;
  kind: string;
  startedAt: string;
  endedAt?: string;
  outcome?: string;
}

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
  list(filter?: SessionFilter): Promise<import("./model/events.js").SessionSummary[]>;
  get(sessionId: string): Promise<Session>;
  items(
    sessionId: string,
    page: { before?: number; limit: number },
  ): Promise<import("./model/events.js").ConversationItem[]>;
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

export interface FactoryLookup {
  folder: string;
  contentHash: string;
  trusted: boolean;
}

export interface AppliedDefinition {
  folder: string;
  contentHash: string;
  droppedParts: string[];
}

export interface FactoryService {
  find(cwd: string): Promise<FactoryLookup | null>;
  trust(folder: string, contentHash: string): Promise<void>;
  revoke(folder: string): Promise<void>;
  applied(sessionId: string): Promise<AppliedDefinition | null>;
  renderTemplate(
    sessionId: string,
    templateId: string,
    inputs: Record<string, string>,
  ): Promise<string>;
}

export interface RunFilter {
  sessionId?: string;
  agentId?: string;
}

export interface Page {
  offset?: number;
  limit: number;
}

export interface RunTotals {
  count: number;
}

export type WritableTarget = { kind: "path"; path: string };

export interface RunService {
  list(
    filter: RunFilter,
    page: Page,
  ): Promise<{ runs: import("./model/events.js").RunSummary[]; totals: RunTotals }>;
  get(runId: string): Promise<RunRecord>;
  rate(
    runId: string,
    rating: { value: number; note?: string },
  ): Promise<import("./model/events.js").Score>;
  judge(runId: string, opts: { agentId: string }): Promise<import("./model/events.js").Score>;
  export(filter: RunFilter, destination: WritableTarget): Promise<{ count: number }>;
  delete(filter: RunFilter | { ids: string[] }): Promise<{ count: number }>;
}

export interface CreateCoreOptions {
  dataDir: string;
  brand: Brand;
  policySources: PolicySource[];
  agentHints?: AgentHints;
  environment?: ResolvedEnv;
  extensions?: CoreExtensions;
  platform?: PlatformAdapter;
  /** Optional host logger; defaults to a redacting stderr logger. */
  log?: Logger;
}

export interface Core {
  readonly brand: Brand;
  readonly environment: ResolvedEnv;
  readonly agents: AgentService;
  readonly sessions: SessionService;
  readonly policy: PolicyService;
  readonly factory: FactoryService;
  readonly runs: RunService;
  readonly settings: SettingsService;
  readonly events: EventStream<CoreEvent>;
  dispose(): Promise<void>;
}

function notReadyError(service: string, method: string): SterError {
  return new SterError("invalid-argument", `${service}.${method} is not available yet`, {
    service,
    method,
  });
}

function createAgentServiceStub(): AgentService {
  return {
    list: () => Promise.resolve([]),
    icon: () => Promise.resolve(null),
    refreshRegistry: () => Promise.resolve({ reachable: false }),
    planInstall: () => Promise.reject(notReadyError("agents", "planInstall")),
    install: () => Promise.reject(notReadyError("agents", "install")),
    remove: () => Promise.reject(notReadyError("agents", "remove")),
    saveCustom: () => Promise.reject(notReadyError("agents", "saveCustom")),
    deleteCustom: () => Promise.reject(notReadyError("agents", "deleteCustom")),
    confirmFirstStart: () => Promise.reject(notReadyError("agents", "confirmFirstStart")),
  };
}

function createSessionServiceStub(): SessionService {
  return {
    create: () => Promise.reject(notReadyError("sessions", "create")),
    list: () => Promise.resolve([]),
    get: () => Promise.reject(notReadyError("sessions", "get")),
    items: () => Promise.resolve([]),
    prompt: () => Promise.reject(notReadyError("sessions", "prompt")),
    cancel: () => Promise.reject(notReadyError("sessions", "cancel")),
    resolveApproval: () => Promise.reject(notReadyError("sessions", "resolveApproval")),
    setPermissionMode: () => Promise.reject(notReadyError("sessions", "setPermissionMode")),
    setConfigOption: () => Promise.reject(notReadyError("sessions", "setConfigOption")),
    rules: () => Promise.resolve([]),
    revokeRule: () => Promise.reject(notReadyError("sessions", "revokeRule")),
    killCommand: () => Promise.reject(notReadyError("sessions", "killCommand")),
    authMethods: () => Promise.resolve([]),
    authenticate: () => Promise.reject(notReadyError("sessions", "authenticate")),
    resume: () => Promise.reject(notReadyError("sessions", "resume")),
    restart: () => Promise.reject(notReadyError("sessions", "restart")),
    rename: () => Promise.reject(notReadyError("sessions", "rename")),
    end: () => Promise.reject(notReadyError("sessions", "end")),
    delete: () => Promise.reject(notReadyError("sessions", "delete")),
  };
}

function createFactoryServiceStub(): FactoryService {
  return {
    find: () => Promise.resolve(null),
    trust: () => Promise.reject(notReadyError("factory", "trust")),
    revoke: () => Promise.reject(notReadyError("factory", "revoke")),
    applied: () => Promise.resolve(null),
    renderTemplate: () => Promise.reject(notReadyError("factory", "renderTemplate")),
  };
}

function createRunServiceStub(): RunService {
  return {
    list: () => Promise.resolve({ runs: [], totals: { count: 0 } }),
    get: () => Promise.reject(notReadyError("runs", "get")),
    rate: () => Promise.reject(notReadyError("runs", "rate")),
    judge: () => Promise.reject(notReadyError("runs", "judge")),
    export: () => Promise.reject(notReadyError("runs", "export")),
    delete: () => Promise.resolve({ count: 0 }),
  };
}

/**
 * Create the UI-independent core (contracts/core-api.md).
 * Fails only when the data directory is unusable. Invalid policy does not fail creation.
 */
export async function createCore(options: CreateCoreOptions): Promise<Core> {
  const log = options.log ?? createLogger({ fields: { component: "core" } });
  const extensions = options.extensions ?? {};

  // Validate extension registries early (duplicate ids throw).
  indexById(extensions.agentSources);
  indexById(extensions.permissionModes);
  indexById(extensions.eventConsumers);
  indexPolicyItems(extensions.policyItems);

  let store: Store;
  try {
    store = openSqliteStore({ dataDir: options.dataDir });
  } catch (cause) {
    if (cause instanceof SterError) {
      throw cause;
    }
    throw new SterError("invalid-argument", "Data directory is unusable", {
      dataDir: options.dataDir,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const environment =
    options.environment ??
    (
      await resolveShellEnv({
        log,
      })
    ).env;

  const policy = createPolicyService({ sources: options.policySources });
  await policy.reload();

  const settings = createSettingsService({ store });
  const events = createEventStream();
  const detachConsumers = attachEventConsumers(events, extensions.eventConsumers ?? [], log);

  const agents = createAgentServiceStub();
  const sessions = createSessionServiceStub();
  const factory = createFactoryServiceStub();
  const runs = createRunServiceStub();

  let disposed = false;

  const core: Core = {
    brand: options.brand,
    environment,
    agents,
    sessions,
    policy,
    factory,
    runs,
    settings,
    events,
    dispose() {
      if (disposed) {
        return Promise.resolve();
      }
      disposed = true;
      detachConsumers();
      store.close();
      log.info("core disposed", { dataDir: options.dataDir });
      return Promise.resolve();
    },
  };

  log.info("core created", {
    dataDir: options.dataDir,
    productName: options.brand.productName,
    policyState: policy.state,
  });

  return core;
}
