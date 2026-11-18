import type { PolicyService } from "../policy/service.js";
import type {
  FactoryAgentCommand,
  FactoryDefinition,
  LocatedFactoryDefinition,
} from "./definition.js";
import { isFactoryAgentRef } from "./definition.js";

export interface FactoryChangeSummary {
  agents: string[];
  defaultAgent?: string;
  permissionMode?: string;
  templates: string[];
  judging: boolean;
  commandAgents: Array<{ name: string; command: string }>;
}

export interface AppliedFactory {
  folder: string;
  definitionPath: string;
  contentHash: string;
  definition: FactoryDefinition;
  /** Agent id or name suggested for new sessions (after policy filter). */
  defaultAgent?: string;
  /** Permission mode suggested for new sessions (after policy filter). */
  permissionMode?: string;
  /** Registry agent ids still allowed after policy. */
  allowedAgentIds: string[];
  /** Command-declared agents that remain after policy (customAllowed). */
  commandAgents: FactoryAgentCommand[];
  /** Human-readable parts dropped by organization policy. */
  droppedParts: string[];
  templates: NonNullable<FactoryDefinition["templates"]>;
  judging?: FactoryDefinition["judging"];
}

/**
 * Summarize what a definition would change before trust (FR-064).
 */
export function summarizeFactoryDefinition(definition: FactoryDefinition): FactoryChangeSummary {
  const agents: string[] = [];
  const commandAgents: Array<{ name: string; command: string }> = [];
  for (const agent of definition.agents ?? []) {
    if (isFactoryAgentRef(agent)) {
      agents.push(agent.id);
    } else {
      agents.push(agent.name);
      commandAgents.push({ name: agent.name, command: agent.command });
    }
  }
  const summary: FactoryChangeSummary = {
    agents,
    templates: (definition.templates ?? []).map((template) => template.id),
    judging: definition.judging !== undefined,
    commandAgents,
  };
  if (definition.defaultAgent !== undefined) {
    summary.defaultAgent = definition.defaultAgent;
  }
  if (definition.permissionMode !== undefined) {
    summary.permissionMode = definition.permissionMode;
  }
  return summary;
}

/**
 * Filter a trusted definition through organization policy (FR-065).
 * Never loosens policy; never auto-approves actions.
 */
export function applyFactoryDefinition(
  located: LocatedFactoryDefinition,
  policy: PolicyService | undefined,
): AppliedFactory {
  const droppedParts: string[] = [];
  const definition = located.definition;
  const allowedAgentIds: string[] = [];
  const commandAgents: FactoryAgentCommand[] = [];

  for (const agent of definition.agents ?? []) {
    if (isFactoryAgentRef(agent)) {
      if (policy && !policy.agentAllowed(agent.id)) {
        droppedParts.push(`agents.id:${agent.id}`);
        continue;
      }
      allowedAgentIds.push(agent.id);
    } else {
      if (policy && !policy.customAgentsAllowed()) {
        droppedParts.push(`agents.command:${agent.name}`);
        continue;
      }
      commandAgents.push({
        name: agent.name,
        command: agent.command,
        ...(agent.args !== undefined ? { args: agent.args } : {}),
        ...(agent.env !== undefined ? { env: agent.env } : {}),
      });
    }
  }

  let permissionMode = definition.permissionMode;
  if (permissionMode !== undefined) {
    const allowedModes = policy?.allowedPermissionModes();
    if (
      allowedModes !== null &&
      allowedModes !== undefined &&
      !allowedModes.includes(permissionMode)
    ) {
      droppedParts.push(`permissionMode:${permissionMode}`);
      permissionMode = undefined;
    }
  }

  let defaultAgent = definition.defaultAgent;
  if (defaultAgent !== undefined) {
    const stillPresent =
      allowedAgentIds.includes(defaultAgent) ||
      commandAgents.some((agent) => agent.name === defaultAgent);
    if (!stillPresent) {
      droppedParts.push(`defaultAgent:${defaultAgent}`);
      defaultAgent = undefined;
    }
  }

  const result: AppliedFactory = {
    folder: located.folder,
    definitionPath: located.definitionPath,
    contentHash: located.contentHash,
    definition,
    allowedAgentIds,
    commandAgents,
    droppedParts,
    templates: definition.templates ?? [],
  };
  if (defaultAgent !== undefined) {
    result.defaultAgent = defaultAgent;
  }
  if (permissionMode !== undefined) {
    result.permissionMode = permissionMode;
  }
  if (definition.judging !== undefined) {
    result.judging = definition.judging;
  }
  return result;
}

/**
 * Stable id for a command-declared factory agent (requires first-start confirm).
 */
export function factoryCommandAgentId(folderHash: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `custom:factory-${folderHash.slice(0, 8)}-${slug || "agent"}`;
}
