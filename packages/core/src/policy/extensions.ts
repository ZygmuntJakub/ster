import type { PolicyHooks, PolicyItemDefinition } from "../extensions/index.js";
import type { OrganizationPolicy, RegistryMode } from "./types.js";
import type { PolicyProblem } from "./service.js";

export interface PolicyRestrictionState {
  blockedAgents: Set<string>;
  blockedModes: Set<string>;
  customAllowed: boolean;
  requireChecksum: boolean;
  allowInstallScripts: boolean;
  registryMode: RegistryMode;
  registryUrl?: string;
}

const REGISTRY_RANK: Record<RegistryMode, number> = {
  public: 0,
  custom: 1,
  disabled: 2,
};

/**
 * Build restrictive-only hooks. Attempts to loosen an existing restriction throw.
 */
export function createRestrictiveHooks(state: PolicyRestrictionState): PolicyHooks {
  return {
    blockAgent(agentId) {
      state.blockedAgents.add(agentId);
    },
    blockMode(modeId) {
      state.blockedModes.add(modeId);
    },
    requireChecksum() {
      state.requireChecksum = true;
    },
    disallowCustomAgents() {
      state.customAllowed = false;
    },
    setRegistry(mode, url) {
      if (REGISTRY_RANK[mode] < REGISTRY_RANK[state.registryMode]) {
        throw new Error(
          `Policy extension cannot loosen registry.mode from ${state.registryMode} to ${mode}`,
        );
      }
      if (mode === "custom" && (url === undefined || url.length === 0)) {
        throw new Error("setRegistry(custom) requires a url");
      }
      if (
        state.registryMode === "custom" &&
        mode === "custom" &&
        state.registryUrl !== undefined &&
        url !== undefined &&
        url !== state.registryUrl
      ) {
        throw new Error("Policy extension cannot change an existing custom registry url");
      }
      state.registryMode = mode;
      if (url !== undefined) {
        state.registryUrl = url;
      }
      if (mode === "disabled") {
        delete state.registryUrl;
      }
    },
  };
}

export function seedRestrictionsFromDocument(document: OrganizationPolicy): PolicyRestrictionState {
  const state: PolicyRestrictionState = {
    blockedAgents: new Set(),
    blockedModes: new Set(),
    customAllowed: document.agents?.customAllowed !== false,
    requireChecksum: document.install?.requireChecksum === true,
    allowInstallScripts: document.install?.allowInstallScripts !== false,
    registryMode: document.registry?.mode ?? "public",
  };
  if (document.registry?.url !== undefined) {
    state.registryUrl = document.registry.url;
  }
  if (document.agents?.allow) {
    // allow-list is positive; blockedAgents filled for agents outside list at enforcement time
  }
  if (document.permissions?.modes) {
    // modes list is positive; blockedModes used by extensions to remove further
  }
  return state;
}

export interface ApplyPolicyExtensionsResult {
  ok: boolean;
  problems: PolicyProblem[];
  restrictions: PolicyRestrictionState;
}

/**
 * Validate and enforce `x-…` PolicyItemDefinition values. Built-in keys are not
 * re-validated here; extensions may only restrict further.
 */
export function applyPolicyExtensions(
  document: OrganizationPolicy,
  definitions: ReadonlyMap<string, PolicyItemDefinition>,
): ApplyPolicyExtensionsResult {
  const problems: PolicyProblem[] = [];
  const restrictions = seedRestrictionsFromDocument(document);
  const hooks = createRestrictiveHooks(restrictions);

  for (const [key, value] of Object.entries(document)) {
    if (!key.startsWith("x-")) {
      continue;
    }
    const definition = definitions.get(key);
    if (!definition) {
      problems.push({
        path: key,
        message: `Unknown policy extension key "${key}"`,
        code: "extension",
        sourceId: "merged",
      });
      continue;
    }
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          path: [key, ...issue.path.map(String)].join("."),
          message: issue.message,
          code: "extension",
          sourceId: "merged",
        });
      }
      continue;
    }
    try {
      definition.enforce(parsed.data, hooks);
    } catch (error) {
      problems.push({
        path: key,
        message: error instanceof Error ? error.message : String(error),
        code: "extension-loosen",
        sourceId: "merged",
      });
    }
  }

  // Also run definitions for known keys if registered (optional restrict-further).
  for (const [key, definition] of definitions) {
    if (key.startsWith("x-")) {
      continue;
    }
    const value = document[key];
    if (value === undefined) {
      continue;
    }
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      continue;
    }
    try {
      definition.enforce(parsed.data, hooks);
    } catch (error) {
      problems.push({
        path: key,
        message: error instanceof Error ? error.message : String(error),
        code: "extension-loosen",
        sourceId: "merged",
      });
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    restrictions,
  };
}
