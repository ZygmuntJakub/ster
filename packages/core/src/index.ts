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

export {
  MOCK_AGENT_ID,
  type AgentDistribution,
  type AgentOrigin,
  type AgentReadiness,
} from "./agents/agent.js";

export { resolvePlatformKey, detectMusl, selectBinaryTarget } from "./agents/platform.js";
export { parseRegistryDocument, DEFAULT_REGISTRY_URL } from "./agents/registry.js";
export { transitionSessionStatus, type SessionStatus } from "./sessions/session.js";

export { brandSchema, loadBrandFromJson, parseBrand, type Brand } from "./brand.js";

export {
  applyFactoryDefinition,
  factoryCommandAgentId,
  summarizeFactoryDefinition,
  type AppliedFactory,
  type FactoryChangeSummary,
} from "./factory/apply.js";

export {
  FACTORY_RELATIVE_PATH,
  findNearestFactoryDefinition,
  hashFactoryContent,
  isFactoryAgentCommand,
  isFactoryAgentRef,
  parseFactoryYaml,
  renderFactoryTemplate,
  validateFactoryDefinition,
  type FactoryAgent,
  type FactoryAgentCommand,
  type FactoryAgentRef,
  type FactoryDefinition,
  type FactoryJudging,
  type FactoryTemplate,
  type LocatedFactoryDefinition,
} from "./factory/definition.js";

export {
  createFactoryService,
  type CreateFactoryServiceOptions,
  type FolderTrustState,
} from "./factory/service.js";

export {
  deriveTrustState,
  getFolderTrust,
  revokeFolderTrust,
  trustFolder,
  type FolderTrust,
} from "./factory/trust.js";

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
  filePolicySource,
  machinePolicyDir,
  machinePolicyPath,
  memoryPolicySource,
} from "./policy/sources.js";

export { validatePolicyDocument } from "./policy/validate.js";
export { mergePolicyDocuments } from "./policy/merge.js";
export {
  applyPolicyExtensions,
  createRestrictiveHooks,
  seedRestrictionsFromDocument,
} from "./policy/extensions.js";
export type {
  OrganizationPolicy,
  OrganizationPolicyAgents,
  OrganizationPolicyInstall,
  OrganizationPolicyPermissions,
  OrganizationPolicyRegistry,
  PolicyTopLevelKey,
  RegistryMode,
} from "./policy/types.js";

export {
  createSettingsService,
  type CreateSettingsServiceOptions,
  type CustomAgentSetting,
  type ManagedSettingKey,
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

export {
  readWorkspaceTextFile,
  resolveWorkspacePath,
  writeWorkspaceTextFile,
} from "./workspace/files.js";

export {
  decidePermission,
  STER_REMEMBER_OPTION_ID,
  withRememberOption,
  type EngineDecision,
} from "./permissions/engine.js";

export {
  ALWAYS_ASK_MODE,
  ALWAYS_ASK_MODE_ID,
  ASK_WITH_RULES_MODE,
  ASK_WITH_RULES_MODE_ID,
  AUTO_APPROVE_READS_MODE,
  AUTO_APPROVE_READS_MODE_ID,
  BUILTIN_PERMISSION_MODES,
  filterPermissionModes,
  isBuiltinPermissionMode,
} from "./permissions/modes.js";

export {
  createRuleStore,
  findMatchingRule,
  ruleMatches,
  type PermissionRule as SessionPermissionRule,
  type RuleStore,
} from "./permissions/rules.js";

export {
  classifyFsPath,
  createExecuteApprovalTracker,
  isExecuteToolSubject,
  OUTSIDE_WORKSPACE_OPTIONS,
  TERMINAL_GUARD_OPTIONS,
  readAbsoluteTextFile,
  writeAbsoluteTextFile,
} from "./permissions/guard.js";

export { filterOneTimeOptions, createApprovalBroker } from "./permissions/approvals.js";

export {
  actionFromUpdate,
  canAdvanceActionStatus,
  mergeActionUpdate,
  type ActionContent,
  type ActionKind,
  type ActionLocation,
  type ActionStatus,
  type AgentAction,
} from "./sessions/actions.js";

export { planFromUpdate, type PlanEntry, type PlanPayload } from "./sessions/plan.js";

/**
 * Sanitize agent-authored text and reject malformed update objects (SC-016).
 */
export {
  asSafeUpdateRecord,
  MAX_AGENT_TEXT_CHARS,
  sanitizeAgentText,
  stripControlSequences,
} from "./sessions/content-safety.js";

/**
 * HTTPS allow-list helpers for registry and confirmed download hosts (FR-042, FR-046).
 */
export {
  assertAllowedHttpsUrl,
  createNetworkAllowlist,
  PUBLIC_REGISTRY_HOST,
  type NetworkAllowlist,
} from "./net/allowlist.js";

export {
  LEGACY_MODE_OPTION_ID,
  applyCurrentModeUpdate,
  commandPromptText,
  configOptionFromModes,
  initialConfigOptions,
  normalizeAvailableCommands,
  normalizeConfigOption,
  normalizeConfigOptions,
  type AvailableCommandInfo,
  type ConfigOption,
  type ConfigOptionCategory,
  type ConfigOptionChoice,
  type SessionModeStateLike,
} from "./sessions/config-options.js";
