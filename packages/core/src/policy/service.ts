/**
 * Organization policy service (contracts/core-api.md).
 * Validates, merges, and exposes enforcement helpers (US10).
 */

import type { PolicyItemDefinition } from "../extensions/index.js";
import { applyPolicyExtensions, type PolicyRestrictionState } from "./extensions.js";
import { mergePolicyDocuments, type PolicyLayer } from "./merge.js";
import type { OrganizationPolicy, RegistryMode } from "./types.js";
import { POLICY_TOP_LEVEL_KEYS } from "./types.js";
import { validatePolicyDocument } from "./validate.js";

export type PolicyState = "absent" | "valid" | "invalid";

export type PolicySourceKind = "builtin" | "machine" | "memory";

export interface PolicySource {
  kind: PolicySourceKind;
  /** Human-readable origin (path or label). */
  label: string;
  /** Return a policy document, or `null` when this source has no file. */
  load(): Promise<null | object>;
}

export interface PolicyProblem {
  path: string;
  message: string;
  code?: string;
  sourceId?: string;
}

export interface EffectivePolicyItem<T = unknown> {
  key: string;
  value: T;
  source: PolicySourceKind;
  managed: boolean;
}

export interface EffectivePolicy {
  items: EffectivePolicyItem[];
}

export interface PolicyService {
  readonly state: PolicyState;
  effective(): EffectivePolicy;
  problems(): PolicyProblem[];
  /** Reload sources. Production hosts load once at start (FR-052). */
  reload(): Promise<void>;
  /** Merged document when state is `valid`; otherwise null. */
  document(): OrganizationPolicy | null;
  /** Extension restriction extras after enforce. */
  restrictions(): PolicyRestrictionState | null;
  agentAllowed(agentId: string): boolean;
  customAgentsAllowed(): boolean;
  registryMode(): RegistryMode;
  registryUrl(): string | undefined;
  requireChecksum(): boolean;
  allowInstallScripts(): boolean;
  allowedPermissionModes(): string[] | null;
  defaultPermissionMode(): string | null;
  managedSettingKeys(): Array<"defaultPermissionMode">;
}

export interface CreatePolicyServiceOptions {
  sources?: PolicySource[];
  policyItems?: ReadonlyArray<PolicyItemDefinition>;
}

function sourceId(source: PolicySource): string {
  return `${source.kind}:${source.label}`;
}

/**
 * Create a policy service with schema validation and per-item merge.
 */
export function createPolicyService(options: CreatePolicyServiceOptions = {}): PolicyService {
  const sources = options.sources ?? [];
  const policyItemMap = new Map<string, PolicyItemDefinition>();
  for (const item of options.policyItems ?? []) {
    if (policyItemMap.has(item.key)) {
      throw new Error(`Duplicate policy item key: ${item.key}`);
    }
    policyItemMap.set(item.key, item);
  }

  let state: PolicyState = "absent";
  let problems: PolicyProblem[] = [];
  let items: EffectivePolicyItem[] = [];
  let merged: OrganizationPolicy | null = null;
  let restrictionState: PolicyRestrictionState | null = null;

  const service: PolicyService = {
    get state() {
      return state;
    },
    effective() {
      return { items: [...items] };
    },
    problems() {
      return [...problems];
    },
    document() {
      return state === "valid" ? merged : null;
    },
    restrictions() {
      return state === "valid" ? restrictionState : null;
    },
    agentAllowed(agentId) {
      if (state === "invalid") {
        return false;
      }
      if (restrictionState?.blockedAgents.has(agentId)) {
        return false;
      }
      const allow = merged?.agents?.allow;
      if (allow === undefined) {
        if (agentId.startsWith("custom:") && !service.customAgentsAllowed()) {
          return false;
        }
        return true;
      }
      if (agentId.startsWith("custom:")) {
        return service.customAgentsAllowed();
      }
      return allow.includes(agentId);
    },
    customAgentsAllowed() {
      if (state === "invalid") {
        return false;
      }
      if (restrictionState) {
        return restrictionState.customAllowed;
      }
      return merged?.agents?.customAllowed !== false;
    },
    registryMode() {
      if (restrictionState) {
        return restrictionState.registryMode;
      }
      return merged?.registry?.mode ?? "public";
    },
    registryUrl() {
      if (restrictionState?.registryUrl !== undefined) {
        return restrictionState.registryUrl;
      }
      return merged?.registry?.url;
    },
    requireChecksum() {
      if (restrictionState) {
        return restrictionState.requireChecksum;
      }
      return merged?.install?.requireChecksum === true;
    },
    allowInstallScripts() {
      if (restrictionState) {
        return restrictionState.allowInstallScripts;
      }
      return merged?.install?.allowInstallScripts !== false;
    },
    allowedPermissionModes() {
      const modes = merged?.permissions?.modes;
      if (modes === undefined) {
        return null;
      }
      const blocked = restrictionState?.blockedModes;
      if (!blocked || blocked.size === 0) {
        return [...modes];
      }
      return modes.filter((mode) => !blocked.has(mode));
    },
    defaultPermissionMode() {
      return merged?.permissions?.default ?? null;
    },
    managedSettingKeys() {
      const keys: Array<"defaultPermissionMode"> = [];
      const defaultItem = items.find((item) => item.key === "permissions.default");
      if (defaultItem?.managed) {
        keys.push("defaultPermissionMode");
      } else if (merged?.permissions?.default !== undefined) {
        // Builtin-set default still locks the setting when policy is valid.
        keys.push("defaultPermissionMode");
      }
      return keys;
    },
    async reload() {
      problems = [];
      items = [];
      merged = null;
      restrictionState = null;

      const layers: PolicyLayer[] = [];
      const itemSources = new Map<string, PolicySourceKind>();

      for (const source of sources) {
        const raw = await source.load();
        if (raw === null) {
          continue;
        }
        const validated = validatePolicyDocument(raw, sourceId(source));
        if (!validated.ok || !validated.document) {
          problems.push(...validated.problems);
          state = "invalid";
          return;
        }
        layers.push({ sourceId: sourceId(source), document: validated.document });
        for (const key of POLICY_TOP_LEVEL_KEYS) {
          if (validated.document[key] !== undefined) {
            itemSources.set(key, source.kind);
          }
        }
        for (const key of Object.keys(validated.document)) {
          if (key.startsWith("x-")) {
            itemSources.set(key, source.kind);
          }
        }
      }

      if (layers.length === 0) {
        state = "absent";
        return;
      }

      const document = mergePolicyDocuments(layers);
      const extensionResult = applyPolicyExtensions(document, policyItemMap);
      if (!extensionResult.ok) {
        problems = extensionResult.problems;
        state = "invalid";
        return;
      }

      merged = document;
      restrictionState = extensionResult.restrictions;

      const nextItems: EffectivePolicyItem[] = [];
      const pushItem = (itemKey: string, topKey: string, value: unknown): void => {
        const sourceKind = itemSources.get(topKey) ?? "builtin";
        nextItems.push({
          key: itemKey,
          value,
          source: sourceKind,
          managed: sourceKind === "machine",
        });
      };
      if (document.agents) {
        if (document.agents.allow !== undefined) {
          pushItem("agents.allow", "agents", document.agents.allow);
        }
        if (document.agents.customAllowed !== undefined) {
          pushItem("agents.customAllowed", "agents", document.agents.customAllowed);
        }
      }
      if (document.registry) {
        pushItem("registry.mode", "registry", document.registry.mode);
        if (document.registry.url !== undefined) {
          pushItem("registry.url", "registry", document.registry.url);
        }
      }
      if (document.install) {
        if (document.install.requireChecksum !== undefined) {
          pushItem("install.requireChecksum", "install", document.install.requireChecksum);
        }
        if (document.install.allowInstallScripts !== undefined) {
          pushItem("install.allowInstallScripts", "install", document.install.allowInstallScripts);
        }
      }
      if (document.permissions) {
        if (document.permissions.modes !== undefined) {
          pushItem("permissions.modes", "permissions", document.permissions.modes);
        }
        if (document.permissions.default !== undefined) {
          pushItem("permissions.default", "permissions", document.permissions.default);
        }
      }
      for (const [key, value] of Object.entries(document)) {
        if (!key.startsWith("x-")) {
          continue;
        }
        const sourceKind = itemSources.get(key) ?? "builtin";
        nextItems.push({
          key,
          value,
          source: sourceKind,
          managed: sourceKind === "machine",
        });
      }

      items = nextItems;
      state = "valid";
    },
  };

  return service;
}

/** No-op retained for callers that still import the US1 stub hook. */
export function enforcePolicyNoop(service: PolicyService): void {
  if (service.state === "invalid") {
    return;
  }
}
