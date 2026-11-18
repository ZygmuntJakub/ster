import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SterError } from "../errors.js";
import type { Logger } from "../log.js";
import type { RegistryStatus } from "../model/events.js";
import type { SettingsService } from "../settings/service.js";
import type { Store } from "../store/store.js";
import { MOCK_AGENT_ID, type Agent, type AgentLaunch, type CustomAgentInput } from "./agent.js";

export interface IconData {
  mimeType: string;
  data: Uint8Array;
}

export interface InstallPlan {
  agentId: string;
  version: string;
  source: string;
  verified: boolean;
}

export interface Progress {
  phase: string;
  fraction?: number;
  message?: string;
}

export interface AgentService {
  list(): Promise<Agent[]>;
  icon(agentId: string): Promise<IconData | null>;
  refreshRegistry(opts?: { force?: boolean }): Promise<RegistryStatus>;
  planInstall(agentId: string): Promise<InstallPlan>;
  install(plan: InstallPlan, onProgress?: (p: Progress) => void): Promise<Agent>;
  remove(agentId: string): Promise<void>;
  saveCustom(def: CustomAgentInput): Promise<Agent>;
  deleteCustom(agentId: string): Promise<void>;
  confirmFirstStart(agentId: string): Promise<void>;
  /** Resolve a known agent by id (including mock / custom). */
  get(agentId: string): Agent | null;
}

export interface CreateAgentServiceOptions {
  store: Store;
  settings: SettingsService;
  log: Logger;
  /** When true (default outside production), expose the mock ACP agent. */
  includeMockAgent?: boolean;
  /** Absolute path to the mock-agent entry script. */
  mockAgentEntry?: string;
  nodeExecutable?: string;
  now?: () => Date;
}

function confirmedKey(agentId: string): string {
  return `agent.confirmed.${agentId}`;
}

function defaultMockEntry(): string {
  // packages/core/src/agents -> packages/mock-agent/src/index.ts
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../../../mock-agent/src/index.ts");
}

function mockLaunch(options: CreateAgentServiceOptions): AgentLaunch {
  return {
    command: options.nodeExecutable ?? process.execPath,
    args: ["--import", "tsx", options.mockAgentEntry ?? defaultMockEntry()],
    env: { NODE_NO_WARNINGS: "1" },
  };
}

/**
 * Minimal AgentService for US1: mock agent in development + custom agents from settings.
 */
export function createAgentService(options: CreateAgentServiceOptions): AgentService {
  const includeMock = options.includeMockAgent ?? process.env["NODE_ENV"] !== "production";
  const now = options.now ?? (() => new Date());

  const confirmedAt = (agentId: string): string | undefined => {
    const value = options.store.getSetting(confirmedKey(agentId));
    return value ?? undefined;
  };

  const loadCustoms = (): Agent[] => {
    return options.settings.get().customAgents.map((custom) => {
      const agent: Agent = {
        id: custom.id,
        name: custom.name,
        origin: "custom",
        distribution: "none",
        readiness: "ready",
        launch: {
          command: custom.command,
          args: custom.args,
          env: custom.env,
        },
      };
      const at = confirmedAt(custom.id);
      if (at !== undefined) {
        agent.confirmedAt = at;
      }
      return agent;
    });
  };

  const mockAgent = (): Agent | null => {
    if (!includeMock) {
      return null;
    }
    const entryPath = options.mockAgentEntry ?? defaultMockEntry();
    if (!existsSync(entryPath)) {
      options.log.warn("mock agent entry missing; omitting mock agent", { entryPath });
      return null;
    }
    const agent: Agent = {
      id: MOCK_AGENT_ID,
      name: "Mock Agent",
      origin: "custom",
      distribution: "none",
      readiness: "ready",
      version: "0.0.0",
      launch: mockLaunch({ ...options, mockAgentEntry: entryPath }),
    };
    const at = confirmedAt(MOCK_AGENT_ID);
    if (at !== undefined) {
      agent.confirmedAt = at;
    }
    return agent;
  };

  const byId = (): Map<string, Agent> => {
    const map = new Map<string, Agent>();
    const mock = mockAgent();
    if (mock) {
      map.set(mock.id, mock);
    }
    for (const custom of loadCustoms()) {
      map.set(custom.id, custom);
    }
    return map;
  };

  return {
    get(agentId) {
      return byId().get(agentId) ?? null;
    },
    list: () => Promise.resolve([...byId().values()]),
    icon: () => Promise.resolve(null),
    refreshRegistry: () => Promise.resolve({ reachable: false }),
    planInstall: () => Promise.reject(new SterError("not-found", "Install plans arrive in US4")),
    install: () => Promise.reject(new SterError("not-found", "Install arrives in US4")),
    remove: () => Promise.reject(new SterError("not-found", "Remove arrives in US4")),
    saveCustom: (def) => {
      const id = def.id ?? `custom:${randomUUID()}`;
      const settings = options.settings.get();
      const next = settings.customAgents.filter((c) => c.id !== id);
      next.push({
        id,
        name: def.name,
        command: def.command,
        args: def.args,
        env: def.env,
      });
      options.settings.set({ customAgents: next });
      options.log.info("custom agent saved", { agentId: id });
      const agent = byId().get(id);
      if (!agent) {
        return Promise.reject(new SterError("not-found", "Custom agent missing after save"));
      }
      return Promise.resolve(agent);
    },
    deleteCustom: (agentId) => {
      if (!agentId.startsWith("custom:")) {
        return Promise.reject(
          new SterError("invalid-argument", "Only custom agents can be deleted here"),
        );
      }
      const settings = options.settings.get();
      options.settings.set({
        customAgents: settings.customAgents.filter((c) => c.id !== agentId),
      });
      return Promise.resolve();
    },
    confirmFirstStart: (agentId) => {
      const agent = byId().get(agentId);
      if (!agent) {
        return Promise.reject(new SterError("not-found", `Unknown agent ${agentId}`));
      }
      if (!agent.launch) {
        return Promise.reject(
          new SterError("agent-not-ready", `Agent ${agentId} has no launch command`),
        );
      }
      options.store.setSetting(confirmedKey(agentId), now().toISOString());
      options.log.info("agent first-start confirmed", { agentId });
      return Promise.resolve();
    },
  };
}
