import {
  createAgentService,
  type AgentService,
  type CreateAgentServiceOptions,
  type IconData,
  type InstallPlan,
  type Progress,
} from "./agents/service.js";
import type { Agent, AgentHints, CustomAgentInput } from "./agents/agent.js";
import { attachEventConsumers } from "./events/consumers.js";
import { createEventStream, type CoreEvent, type EventStream } from "./events/stream.js";
import { SterError } from "./errors.js";
import { indexById, indexPolicyItems, type CoreExtensions } from "./extensions/index.js";
import { createLogger, type Logger } from "./log.js";
import type { Brand } from "./brand.js";
import type { RegistryStatus } from "./model/events.js";
import { BUILTIN_PERMISSION_MODES, filterPermissionModes } from "./permissions/modes.js";
import { createPolicyService, type PolicyService, type PolicySource } from "./policy/service.js";
import { resolveShellEnv, type ResolvedEnv } from "./platform/shell-env.js";
import type { RunRecord } from "./runs/lifecycle.js";
import {
  createRunService,
  type Page,
  type RunFilter,
  type RunService,
  type RunTotals,
  type WritableTarget,
} from "./runs/service.js";
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

export type { Agent, AgentHints, CustomAgentInput, IconData, InstallPlan, Progress };
export type { AuthMethod, PermissionRule, PromptContent, Session, SessionFilter, SessionService };
export type { RunRecord };
export type { AgentService };
export type { Page, RunFilter, RunService, RunTotals, WritableTarget };

/**
 * Host-provided platform hooks. The core never opens URLs or terminals itself.
 */
export interface PlatformAdapter {
  openExternal(url: string): Promise<void>;
  openTerminal?(cwd: string): Promise<void>;
}

export type { AppliedDefinition, FactoryLookup, FactoryService } from "./factory/service.js";
import type { FactoryService } from "./factory/service.js";
import { createFactoryService } from "./factory/service.js";

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
  /** Override the ACP registry index URL (tests / org policy). */
  registryUrl?: string;
  fetchImpl?: typeof fetch;
  seedNodeBinary?: string;
  /** First-launch settings seed (e.g. system language). Ignored when settings already exist. */
  settingsDefaults?: Partial<import("./settings/service.js").Settings>;
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

  const policy = createPolicyService({
    sources: options.policySources,
    ...(extensions.policyItems !== undefined ? { policyItems: extensions.policyItems } : {}),
  });
  await policy.reload();

  const managedKeys = policy.managedSettingKeys();
  const policyDefaultMode = policy.defaultPermissionMode();
  const managedValues =
    policyDefaultMode !== null ? { defaultPermissionMode: policyDefaultMode } : undefined;
  const settingsDefaults = {
    ...(options.settingsDefaults ?? {}),
    ...(managedValues ?? {}),
  };
  const settings = createSettingsService({
    store,
    ...(managedKeys.length > 0 ? { managedKeys } : {}),
    ...(managedValues !== undefined ? { managedValues } : {}),
    ...(Object.keys(settingsDefaults).length > 0 ? { defaults: settingsDefaults } : {}),
  });
  const events = createEventStream();
  const detachConsumers = attachEventConsumers(events, extensions.eventConsumers ?? [], log);

  const agentOptions: CreateAgentServiceOptions = {
    store,
    settings,
    log,
    environment,
    events,
    policy,
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
  if (options.agentHints !== undefined) {
    agentOptions.agentHints = options.agentHints;
  }
  if (extensions.agentSources !== undefined) {
    agentOptions.agentSources = extensions.agentSources;
  }
  if (options.registryUrl !== undefined) {
    agentOptions.registryUrl = options.registryUrl;
  }
  if (options.fetchImpl !== undefined) {
    agentOptions.fetchImpl = options.fetchImpl;
  }
  if (options.seedNodeBinary !== undefined) {
    agentOptions.seedNodeBinary = options.seedNodeBinary;
  }
  const agents = createAgentService(agentOptions);

  const allModes = [...BUILTIN_PERMISSION_MODES, ...(extensions.permissionModes ?? [])];
  const allowedModeIds = policy.allowedPermissionModes();
  const permissionModes = filterPermissionModes(allModes, allowedModeIds);
  let defaultPermissionMode = settings.get().defaultPermissionMode;
  if (allowedModeIds !== null && !allowedModeIds.includes(defaultPermissionMode)) {
    defaultPermissionMode = permissionModes[0]?.id ?? defaultPermissionMode;
  }
  const factory = createFactoryService({
    store,
    policy,
    agents,
    getSessionFactory: (sessionId) => {
      const row = store.getSession(sessionId);
      if (!row) {
        return null;
      }
      let factoryDefinitionHash: string | undefined;
      try {
        const payload = JSON.parse(row.payloadJson) as { factoryDefinitionHash?: string };
        if (typeof payload.factoryDefinitionHash === "string") {
          factoryDefinitionHash = payload.factoryDefinitionHash;
        }
      } catch {
        factoryDefinitionHash = undefined;
      }
      return {
        cwd: row.cwd,
        ...(factoryDefinitionHash !== undefined ? { factoryDefinitionHash } : {}),
      };
    },
  });

  const runs = createRunService({
    store,
    events,
    agents,
    policy,
    factory,
    environment,
    log,
  });

  const sessionsHandle = createSessionService({
    store,
    agents,
    events,
    environment,
    log,
    policy,
    defaultPermissionMode,
    permissionModes,
    resolveFactory: (cwd) => factory.resolveApplied(cwd),
    runs: {
      save: (run) => {
        runs.save(run);
      },
      markInterrupted: (runIds) => {
        runs.markInterrupted(runIds);
      },
      deleteForSession: async (sessionId) => {
        await runs.deleteForSession(sessionId);
      },
      keepWithoutText: async (sessionId) => {
        await runs.keepWithoutText(sessionId);
      },
    },
  });

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
