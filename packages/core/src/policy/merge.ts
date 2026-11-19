import type { OrganizationPolicy, PolicyTopLevelKey } from "./types.js";

export interface PolicyLayer {
  sourceId: string;
  document: OrganizationPolicy;
}

/**
 * Merge policy layers in ascending precedence (later wins per top-level item).
 * Builtin then machine: machine replaces any top-level key it defines.
 * Extension `x-*` keys: later source wins per key name.
 */
export function mergePolicyDocuments(layers: readonly PolicyLayer[]): OrganizationPolicy {
  const merged: OrganizationPolicy = { version: 1 };

  for (const layer of layers) {
    if (layer.document.agents !== undefined) {
      merged.agents = structuredClone(layer.document.agents);
    }
    if (layer.document.registry !== undefined) {
      merged.registry = structuredClone(layer.document.registry);
    }
    if (layer.document.install !== undefined) {
      merged.install = structuredClone(layer.document.install);
    }
    if (layer.document.permissions !== undefined) {
      merged.permissions = structuredClone(layer.document.permissions);
    }
    for (const [key, value] of Object.entries(layer.document)) {
      if (key.startsWith("x-")) {
        merged[key] = structuredClone(value);
      }
    }
  }

  return merged;
}

export function hasTopLevelItem(document: OrganizationPolicy, key: PolicyTopLevelKey): boolean {
  return document[key] !== undefined;
}
