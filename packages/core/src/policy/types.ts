/**
 * Organization policy document (contracts/policy.schema.json, data-model.md).
 */

export type RegistryMode = "public" | "custom" | "disabled";

export interface OrganizationPolicyAgents {
  allow?: string[];
  customAllowed?: boolean;
}

export interface OrganizationPolicyRegistry {
  mode: RegistryMode;
  url?: string;
}

export interface OrganizationPolicyInstall {
  requireChecksum?: boolean;
  allowInstallScripts?: boolean;
}

export interface OrganizationPolicyPermissions {
  modes?: string[];
  default?: string;
}

export interface OrganizationPolicy {
  version: 1;
  agents?: OrganizationPolicyAgents;
  registry?: OrganizationPolicyRegistry;
  install?: OrganizationPolicyInstall;
  permissions?: OrganizationPolicyPermissions;
  /** Extension keys `x-…` retained as opaque values after validation. */
  [key: string]: unknown;
}

export type PolicyTopLevelKey = "agents" | "registry" | "install" | "permissions";

export const POLICY_TOP_LEVEL_KEYS: readonly PolicyTopLevelKey[] = [
  "agents",
  "registry",
  "install",
  "permissions",
] as const;
