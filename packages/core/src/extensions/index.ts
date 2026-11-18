import type { ZodType } from "zod";
import type { CoreEvent } from "../events/stream.js";

/**
 * Extension contracts from contracts/core-api.md (FR-059).
 * All are plain typed objects compiled into the application.
 */

export interface SourceContext {
  /** Resolved shell environment used for detection and launch. */
  env: Readonly<Record<string, string>>;
  dataDir: string;
}

export interface AgentCandidate {
  id: string;
  name: string;
  origin: string;
  version?: string;
  launch?: { command: string; args: string[]; env: Record<string, string> };
}

export interface AgentSource {
  id: string;
  list(ctx: SourceContext): Promise<AgentCandidate[]>;
}

export interface PermissionRequestView {
  toolName?: string;
  kind?: string;
  locations?: ReadonlyArray<{ path: string; line?: number }>;
  options: ReadonlyArray<{ optionId: string; name: string; kind: string }>;
  source: "agent" | "client-guard";
}

export interface PermissionContext {
  sessionId: string;
  cwd: string;
  modeId: string;
}

export interface PermissionModeDefinition {
  id: string;
  /** Translation key for the mode label. */
  labelKey: string;
  decide(req: PermissionRequestView, ctx: PermissionContext): "prompt" | { select: string };
}

export interface PolicyHooks {
  /** Restrictive hooks only; implementations must not approve agent actions. */
  blockAgent(agentId: string): void;
  blockMode(modeId: string): void;
  requireChecksum(): void;
  disallowCustomAgents(): void;
  setRegistry(mode: "public" | "custom" | "disabled", url?: string): void;
}

export interface PolicyItemDefinition<T = unknown> {
  /** Top-level policy key; extension keys must be namespaced `x-…`. */
  key: string;
  schema: ZodType<T>;
  /** May only restrict what the application offers. */
  enforce(value: T, hooks: PolicyHooks): void;
}

export interface SessionEventConsumer {
  id: string;
  onEvent(event: CoreEvent): void | Promise<void>;
}

export interface CoreExtensions {
  agentSources?: AgentSource[];
  permissionModes?: PermissionModeDefinition[];
  policyItems?: PolicyItemDefinition[];
  eventConsumers?: SessionEventConsumer[];
}

/**
 * Registry helpers that keep extension ids unique within each kind.
 */
export function indexById<T extends { id: string }>(
  items: ReadonlyArray<T> | undefined,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items ?? []) {
    if (map.has(item.id)) {
      throw new Error(`Duplicate extension id: ${item.id}`);
    }
    map.set(item.id, item);
  }
  return map;
}

export function indexPolicyItems(
  items: ReadonlyArray<PolicyItemDefinition> | undefined,
): Map<string, PolicyItemDefinition> {
  const map = new Map<string, PolicyItemDefinition>();
  for (const item of items ?? []) {
    if (map.has(item.key)) {
      throw new Error(`Duplicate policy item key: ${item.key}`);
    }
    map.set(item.key, item);
  }
  return map;
}
