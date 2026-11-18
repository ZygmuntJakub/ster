/**
 * Agent model (data-model.md `Agent`).
 */

export type AgentOrigin = "registry" | "detected" | "custom";

export type AgentDistribution = "binary" | "npx" | "uvx" | "none";

export type AgentReadiness =
  | "ready"
  | "needs-login"
  | "not-installed"
  | "unavailable"
  | "blocked-by-policy"
  | "update-available"
  | "integrity-failed";

export interface AgentLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentInstall {
  path: string;
  installedAt: string;
  launchHash: string;
  verified: "registry" | "first-use";
  scriptsAllowed: boolean;
}

export interface Agent {
  id: string;
  name: string;
  origin: AgentOrigin;
  readiness: AgentReadiness;
  distribution: AgentDistribution;
  version?: string;
  launch?: AgentLaunch;
  install?: AgentInstall;
  /** First-start confirmation timestamp (FR-058); cleared when launch changes. */
  confirmedAt?: string;
}

export const MOCK_AGENT_ID = "mock-agent" as const;

export interface CustomAgentInput {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  id?: string;
}
