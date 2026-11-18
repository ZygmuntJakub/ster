/**
 * Public API for the UI-independent Ster core.
 */
export const CORE_VERSION = "0.0.0" as const;

export {
  createCore,
  type Agent,
  type AgentHints,
  type AgentService,
  type AppliedDefinition,
  type AuthMethod,
  type Core,
  type CreateCoreOptions,
  type CustomAgentInput,
  type FactoryLookup,
  type FactoryService,
  type IconData,
  type InstallPlan,
  type Page,
  type PermissionRule,
  type PlatformAdapter,
  type Progress,
  type PromptContent,
  type RunFilter,
  type RunRecord,
  type RunService,
  type RunTotals,
  type Session,
  type SessionFilter,
  type SessionService,
  type WritableTarget,
} from "./core.js";

export { brandSchema, loadBrandFromJson, parseBrand, type Brand } from "./brand.js";

export {
  isSterError,
  isSterErrorCode,
  SterError,
  STER_ERROR_CODES,
  type SterErrorCode,
} from "./errors.js";

export {
  createLogger,
  redactValue,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type Logger,
} from "./log.js";

export {
  createEventStream,
  type CoreEvent,
  type CoreEventPayload,
  type EventFilter,
  type EventListener,
  type EventStream,
} from "./events/stream.js";

export { attachEventConsumers } from "./events/consumers.js";

export {
  indexById,
  indexPolicyItems,
  type AgentCandidate,
  type AgentSource,
  type CoreExtensions,
  type PermissionContext,
  type PermissionModeDefinition,
  type PermissionRequestView,
  type PolicyHooks,
  type PolicyItemDefinition,
  type SessionEventConsumer,
  type SourceContext,
} from "./extensions/index.js";

export type {
  ApprovalOption,
  ApprovalOutcome,
  ApprovalRequest,
  CommandExit,
  ConversationItem,
  ItemPatch,
  RegistryStatus,
  RunSummary,
  Score,
  SessionSummary,
} from "./model/events.js";

export type {
  ConversationItemRow,
  ItemPage,
  NewConversationItem,
  SessionRow,
  Store,
} from "./store/store.js";

export { openSqliteStore, type OpenSqliteStoreOptions, type SqliteStore } from "./store/sqlite.js";

export {
  fallbackPathDirs,
  mergeFallbackPath,
  parseEnvDump,
  resolveShellEnv,
  type ResolvedEnv,
  type ResolveShellEnvOptions,
  type ShellEnvResult,
  type ShellEnvSource,
} from "./platform/shell-env.js";

export {
  createPolicyService,
  enforcePolicyNoop,
  type CreatePolicyServiceOptions,
  type EffectivePolicy,
  type EffectivePolicyItem,
  type PolicyProblem,
  type PolicyService,
  type PolicySource,
  type PolicySourceKind,
  type PolicyState,
} from "./policy/service.js";

export {
  createSettingsService,
  type CreateSettingsServiceOptions,
  type CustomAgentSetting,
  type Settings,
  type SettingsService,
  type ThemePreference,
} from "./settings/service.js";

export {
  filterAgentEnvironment,
  spawnAgentProcess,
  type AgentLaunch,
  type AgentProcess,
  type SpawnAgentProcessOptions,
} from "./acp/process.js";

export {
  connectAgent,
  type AcpConnection,
  type CapabilitySnapshot,
  type ConnectAgentOptions,
  type SessionUpdateHandler,
} from "./acp/connection.js";
