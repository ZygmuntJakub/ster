/**
 * Public API for the UI-independent Ster core.
 */
export const CORE_VERSION = "0.0.0" as const;

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
