import type { AgentService } from "../agents/service.js";
import { SterError } from "../errors.js";
import type { PolicyService } from "../policy/service.js";
import type { Store } from "../store/store.js";
import {
  applyFactoryDefinition,
  factoryCommandAgentId,
  summarizeFactoryDefinition,
  type AppliedFactory,
  type FactoryChangeSummary,
} from "./apply.js";
import {
  findNearestFactoryDefinition,
  hashFactoryContent,
  renderFactoryTemplate,
  type FactoryDefinition,
  type LocatedFactoryDefinition,
} from "./definition.js";
import {
  deriveTrustState,
  getFolderTrust,
  revokeFolderTrust,
  trustFolder,
  type FolderTrustState,
} from "./trust.js";

export type { AppliedFactory, FactoryChangeSummary, FactoryDefinition, FolderTrustState };

export interface FactoryLookup {
  folder: string;
  definitionPath: string;
  contentHash: string;
  trustState: FolderTrustState;
  /** True only when trustState is `trusted`. */
  trusted: boolean;
  definition: FactoryDefinition;
  changeSummary: FactoryChangeSummary;
  /** Present when currently trusted and filtered through policy. */
  applied?: AppliedFactory;
}

export interface AppliedDefinition {
  folder: string;
  contentHash: string;
  droppedParts: string[];
  defaultAgent?: string;
  permissionMode?: string;
  templates: AppliedFactory["templates"];
  judging?: AppliedFactory["judging"];
}

export interface FactoryService {
  find(cwd: string): Promise<FactoryLookup | null>;
  trust(folder: string, contentHash: string): Promise<void>;
  revoke(folder: string): Promise<void>;
  applied(sessionId: string): Promise<AppliedDefinition | null>;
  renderTemplate(
    sessionId: string,
    templateId: string,
    inputs: Record<string, string>,
  ): Promise<string>;
  /** Resolve applied factory for a cwd when trusted (session create). */
  resolveApplied(cwd: string): AppliedFactory | null;
}

export interface CreateFactoryServiceOptions {
  store: Store;
  policy: PolicyService;
  agents: AgentService;
  /** Resolve session cwd + factory hash for applied()/renderTemplate. */
  getSessionFactory?: (sessionId: string) => {
    cwd: string;
    factoryDefinitionHash?: string;
  } | null;
}

/**
 * Factory definition lookup, trust, and template rendering (US11).
 */
export function createFactoryService(options: CreateFactoryServiceOptions): FactoryService {
  const locate = (cwd: string): LocatedFactoryDefinition | null => {
    try {
      return findNearestFactoryDefinition(cwd);
    } catch (error) {
      if (error instanceof SterError && error.code === "definition-invalid") {
        throw error;
      }
      throw error;
    }
  };

  const toLookup = (located: LocatedFactoryDefinition): FactoryLookup => {
    const stored = getFolderTrust(options.store, located.folder);
    const trustState = deriveTrustState(stored, located.contentHash);
    const changeSummary = summarizeFactoryDefinition(located.definition);
    const lookup: FactoryLookup = {
      folder: located.folder,
      definitionPath: located.definitionPath,
      contentHash: located.contentHash,
      trustState,
      trusted: trustState === "trusted",
      definition: located.definition,
      changeSummary,
    };
    if (trustState === "trusted") {
      lookup.applied = applyFactoryDefinition(located, options.policy);
    }
    return lookup;
  };

  const ensureCommandAgentsRegistered = async (applied: AppliedFactory): Promise<void> => {
    for (const agent of applied.commandAgents) {
      const id = factoryCommandAgentId(applied.contentHash, agent.name);
      const existing = options.agents.get(id);
      if (existing) {
        continue;
      }
      await options.agents.saveCustom({
        id,
        name: agent.name,
        command: agent.command,
        args: agent.args ?? [],
        env: agent.env ?? {},
      });
    }
  };

  const service: FactoryService = {
    find(cwd) {
      const located = locate(cwd);
      if (!located) {
        return Promise.resolve(null);
      }
      return Promise.resolve(toLookup(located));
    },

    async trust(folder, contentHash) {
      const located = locate(folder);
      if (!located) {
        throw new SterError("not-found", "No factory definition found for folder", { folder });
      }
      // Trust is keyed by the definition's folder (nearest ancestor that owns the file).
      if (located.contentHash !== contentHash) {
        throw new SterError(
          "invalid-argument",
          "Factory definition changed since it was shown; review again",
          { expected: contentHash, actual: located.contentHash },
        );
      }
      trustFolder(options.store, {
        folder: located.folder,
        definitionPath: located.definitionPath,
        contentHash: located.contentHash,
        expectedHash: contentHash,
      });
      const applied = applyFactoryDefinition(located, options.policy);
      await ensureCommandAgentsRegistered(applied);
    },

    revoke(folder) {
      const located = locate(folder);
      const target = located?.folder ?? folder;
      revokeFolderTrust(options.store, target);
      return Promise.resolve();
    },

    resolveApplied(cwd) {
      const located = locate(cwd);
      if (!located) {
        return null;
      }
      const stored = getFolderTrust(options.store, located.folder);
      if (deriveTrustState(stored, located.contentHash) !== "trusted") {
        return null;
      }
      return applyFactoryDefinition(located, options.policy);
    },

    applied(sessionId) {
      const session = options.getSessionFactory?.(sessionId);
      if (!session) {
        return Promise.resolve(null);
      }
      const applied = service.resolveApplied(session.cwd);
      if (!applied) {
        return Promise.resolve(null);
      }
      if (
        session.factoryDefinitionHash !== undefined &&
        session.factoryDefinitionHash !== applied.contentHash
      ) {
        return Promise.resolve(null);
      }
      const result: AppliedDefinition = {
        folder: applied.folder,
        contentHash: applied.contentHash,
        droppedParts: applied.droppedParts,
        templates: applied.templates,
      };
      if (applied.defaultAgent !== undefined) {
        result.defaultAgent = applied.defaultAgent;
      }
      if (applied.permissionMode !== undefined) {
        result.permissionMode = applied.permissionMode;
      }
      if (applied.judging !== undefined) {
        result.judging = applied.judging;
      }
      return Promise.resolve(result);
    },

    renderTemplate(sessionId, templateId, inputs) {
      const session = options.getSessionFactory?.(sessionId);
      if (!session) {
        return Promise.reject(new SterError("not-found", `Unknown session ${sessionId}`));
      }
      const applied = service.resolveApplied(session.cwd);
      if (!applied) {
        return Promise.reject(
          new SterError(
            "definition-untrusted",
            "Factory definition is not trusted for this folder",
          ),
        );
      }
      if (
        session.factoryDefinitionHash !== undefined &&
        session.factoryDefinitionHash !== applied.contentHash
      ) {
        return Promise.reject(
          new SterError(
            "definition-untrusted",
            "Session factory definition no longer matches disk",
          ),
        );
      }
      const template = applied.templates.find((entry) => entry.id === templateId);
      if (!template) {
        return Promise.reject(new SterError("not-found", `Unknown template ${templateId}`));
      }
      const merged: Record<string, string> = {};
      for (const input of template.inputs ?? []) {
        if (input.default !== undefined) {
          merged[input.name] = input.default;
        }
      }
      for (const [key, value] of Object.entries(inputs)) {
        merged[key] = value;
      }
      return Promise.resolve(renderFactoryTemplate(template.prompt, merged));
    },
  };

  return service;
}

export { hashFactoryContent, renderFactoryTemplate, findNearestFactoryDefinition };
