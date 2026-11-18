import {
  createAgentService,
  type AgentService,
  type CreateAgentServiceOptions,
  type IconData,
  type InstallPlan,
  type Progress,
} from "./agents/service.js";
import type { Agent, CustomAgentInput } from "./agents/agent.js";
import { attachEventConsumers } from "./events/consumers.js";
import { createEventStream, type CoreEvent, type EventStream } from "./events/stream.js";
import { SterError } from "./errors.js";
import { indexById, indexPolicyItems, type CoreExtensions } from "./extensions/index.js";
import { createLogger, type Logger } from "./log.js";
import type { Brand } from "./brand.js";
import type { RegistryStatus, RunSummary, Score } from "./model/events.js";
import { createPolicyService, type PolicyService, type PolicySource } from "./policy/service.js";
import { resolveShellEnv, type ResolvedEnv } from "./platform/shell-env.js";
import type { RunRecord } from "./runs/lifecycle.js";
import { createSettingsService, type SettingsService } from "./settings/service.js";
import {
  createSessionService,
  type AuthMethod,
  type PermissionRule,
  type PromptContent,
  type SessionService,
} from "./sessions/service.js";
import type { Session, SessionFilter } from "./sessions/session.js";
import { openSqliteStore } from "./store/sqlite.js";
import type { Store } from "./store/store.js";

export type { Agent, CustomAgentInput, IconData, InstallPlan, Progress };
export type { AuthMethod, PermissionRule, PromptContent, Session, SessionFilter, SessionService };
export type { RunRecord };
export type { AgentService };

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
  list(filter: RunFilter, page: Page): Promise<{ runs: RunSummary[]; totals: RunTotals }>;
  get(runId: string): Promise<RunRecord>;
  rate(runId: string, rating: { value: number; note?: string }): Promise<Score>;
  judge(runId: string, opts: { agentId: string }): Promise<Score>;
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
  /** Expose the mock ACP agent (default: non-production). */
  includeMockAgent?: boolean;
  mockAgentEntry?: string;
  nodeExecutable?: string;
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

  const agentOptions: CreateAgentServiceOptions = {
    store,
    settings,
    log,
  };
  if (options.includeMockAgent !== undefined) {
    agentOptions.includeMockAgent = options.includeMockAgent;
  }
  if (options.mockAgentEntry !== undefined) {
    agentOptions.mockAgentEntry = options.mockAgentEntry;
  }
  if (options.nodeExecutable !== undefined) {
    agentOptions.nodeExecutable = options.nodeExecutable;
  }
  const agents = createAgentService(agentOptions);

  const sessionsHandle = createSessionService({
    store,
    agents,
    events,
    environment,
    log,
    defaultPermissionMode: settings.get().defaultPermissionMode,
    permissionModes: [...(extensions.permissionModes ?? [])],
  });

  const factory = createFactoryServiceStub();
  const runs = createRunServiceStub();

  let disposed = false;

  const core: Core = {
    brand: options.brand,
    environment,
    agents,
    sessions: sessionsHandle.service,
    policy,
    factory,
    runs,
    settings,
    events,
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      await sessionsHandle.dispose();
      detachConsumers();
      store.close();
      log.info("core disposed", { dataDir: options.dataDir });
    },
  };

  log.info("core created", {
    dataDir: options.dataDir,
    productName: options.brand.productName,
    policyState: policy.state,
  });

  return core;
}

// Re-export RegistryStatus for callers that imported it via AgentService refresh.
export type { RegistryStatus };
