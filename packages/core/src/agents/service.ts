import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventStream, CoreEvent } from "../events/stream.js";
import type { AgentSource } from "../extensions/index.js";
import { SterError } from "../errors.js";
import type { Logger } from "../log.js";
import type { RegistryStatus } from "../model/events.js";
import type { ResolvedEnv } from "../platform/shell-env.js";
import type { PolicyService } from "../policy/service.js";
import type { SettingsService } from "../settings/service.js";
import type { Store } from "../store/store.js";
import {
  MOCK_AGENT_ID,
  type Agent,
  type AgentHints,
  type AgentLaunch,
  type CustomAgentInput,
  type IconData,
  type Progress,
} from "./agent.js";
import { detectInstalledAgents, findOnPath } from "./detect.js";
import { fetchAgentIcon } from "./icons.js";
import { installBinaryAgent } from "./install-binary.js";
import { installNpmAgent } from "./install-npm.js";
import { installUvxAgent } from "./install-uvx.js";
import { assertLaunchIntegrity } from "./integrity.js";
import { planInstall, readinessForRegistryEntry, type InstallPlan } from "./plan.js";
import { resolvePlatformKey } from "./platform.js";
import {
  createRegistryClient,
  DEFAULT_REGISTRY_URL,
  type RegistryClient,
  type RegistryClientMode,
} from "./registry.js";
import { listExtensionAgents } from "./sources.js";

export type { IconData, InstallPlan, Progress };

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
  /** Verify launch hash for an installed agent before start. */
  assertIntegrity(agentId: string): Promise<void>;
}

export interface CreateAgentServiceOptions {
  store: Store;
  settings: SettingsService;
  log: Logger;
  environment: ResolvedEnv;
  events?: EventStream<CoreEvent>;
  agentHints?: AgentHints;
  agentSources?: ReadonlyArray<AgentSource>;
  registryUrl?: string;
  /** Organization policy for allow-lists, registry, and install rules (US10). */
  policy?: PolicyService;
  fetchImpl?: typeof fetch;
  seedNodeBinary?: string;
  /** When true (default outside production), expose the mock ACP agent. */
  includeMockAgent?: boolean;
  /** Absolute path to the mock-agent entry script. */
  mockAgentEntry?: string;
  nodeExecutable?: string;
  now?: () => Date;
}

function resolveRegistryOptions(options: CreateAgentServiceOptions): {
  mode: RegistryClientMode;
  url?: string;
} {
  const mode = options.policy?.registryMode() ?? "public";
  if (mode === "disabled") {
    return { mode };
  }
  if (mode === "custom") {
    const url = options.policy?.registryUrl();
    return url !== undefined ? { mode, url } : { mode };
  }
  if (options.registryUrl !== undefined) {
    return { mode: "public", url: options.registryUrl };
  }
  return { mode: "public", url: DEFAULT_REGISTRY_URL };
}

function confirmedKey(agentId: string): string {
  return `agent.confirmed.${agentId}`;
}

function installedMetaPath(dataDir: string, agentId: string): string {
  return join(dataDir, "agents", agentId, "installed.json");
}

interface InstalledMeta {
  agent: Agent;
}

function defaultMockEntry(): string {
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

function writeInstalled(dataDir: string, agent: Agent): void {
  const path = installedMetaPath(dataDir, agent.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ agent } satisfies InstalledMeta, null, 2));
}

function readInstalled(dataDir: string, agentId: string): Agent | null {
  const path = installedMetaPath(dataDir, agentId);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as InstalledMeta;
    return raw.agent;
  } catch {
    return null;
  }
}

function listInstalled(dataDir: string): Agent[] {
  const root = join(dataDir, "agents");
  if (!existsSync(root)) {
    return [];
  }
  const agents: Agent[] = [];
  for (const id of readdirSync(root)) {
    if (id.startsWith(".")) {
      continue;
    }
    const agent = readInstalled(dataDir, id);
    if (agent) {
      agents.push(agent);
    }
  }
  return agents;
}

/**
 * Full AgentService: registry, detection, install, custom agents (US4).
 */
export function createAgentService(options: CreateAgentServiceOptions): AgentService {
  const includeMock = options.includeMockAgent ?? process.env["NODE_ENV"] !== "production";
  const now = options.now ?? (() => new Date());
  const dataDir = options.store.dataDir;
  const hints = options.agentHints ?? {};
  const platformKey = resolvePlatformKey();
  const registryOpts = resolveRegistryOptions(options);
  const registry: RegistryClient = createRegistryClient({
    dataDir,
    mode: registryOpts.mode,
    ...(registryOpts.url !== undefined ? { url: registryOpts.url } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    now,
  });
  const plans = new Map<string, InstallPlan>();

  const applyPolicyReadiness = (agent: Agent): Agent => {
    if (!options.policy || options.policy.state === "absent") {
      return agent;
    }
    if (options.policy.state === "invalid" || !options.policy.agentAllowed(agent.id)) {
      return { ...agent, readiness: "blocked-by-policy" };
    }
    return agent;
  };

  const confirmedAt = (agentId: string): string | undefined => {
    const value = options.store.getSetting(confirmedKey(agentId));
    return value ?? undefined;
  };

  const uvAvailable = (): boolean => Boolean(findOnPath("uv", options.environment));

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

  const mergeList = async (): Promise<Agent[]> => {
    const byId = new Map<string, Agent>();

    const mock = mockAgent();
    if (mock) {
      byId.set(mock.id, mock);
    }

    for (const custom of loadCustoms()) {
      byId.set(custom.id, custom);
    }

    for (const installed of listInstalled(dataDir)) {
      const at = confirmedAt(installed.id);
      const copy = { ...installed };
      if (at !== undefined) {
        copy.confirmedAt = at;
      }
      if (installed.install && installed.launch) {
        try {
          await assertLaunchIntegrity(installed.launch.command, installed.install.launchHash);
        } catch {
          copy.readiness = "integrity-failed";
        }
      }
      const entry = registry.getEntry(installed.id);
      if (entry && entry.version !== installed.version) {
        copy.readiness =
          copy.readiness === "integrity-failed" ? "integrity-failed" : "update-available";
      }
      byId.set(copy.id, copy);
    }

    const detected = detectInstalledAgents({
      entries: registry.listEntries(),
      env: options.environment,
      platformKey,
      hints,
    });
    for (const agent of detected) {
      if (byId.has(agent.id)) {
        continue;
      }
      const at = confirmedAt(agent.id);
      if (at !== undefined) {
        agent.confirmedAt = at;
      }
      byId.set(agent.id, agent);
    }

    for (const entry of registry.listEntries()) {
      if (byId.has(entry.id)) {
        continue;
      }
      const readiness = readinessForRegistryEntry({
        entry,
        platformKey,
        uvAvailable: uvAvailable(),
      });
      byId.set(entry.id, {
        id: entry.id,
        name: entry.name,
        origin: "registry",
        version: entry.version,
        distribution: entry.distribution.binary
          ? "binary"
          : entry.distribution.npx
            ? "npx"
            : entry.distribution.uvx
              ? "uvx"
              : "none",
        readiness,
      });
    }

    if (options.agentSources?.length) {
      const extensionAgents = await listExtensionAgents(options.agentSources, {
        env: options.environment,
        dataDir,
      });
      for (const agent of extensionAgents) {
        if (!byId.has(agent.id)) {
          byId.set(agent.id, agent);
        }
      }
    }

    return [...byId.values()].map(applyPolicyReadiness);
  };

  const service: AgentService = {
    get(agentId) {
      // Sync snapshot without integrity await — list()/assertIntegrity for full checks.
      const installed = readInstalled(dataDir, agentId);
      if (installed) {
        return installed;
      }
      return null;
    },

    list: () => mergeList(),

    async icon(agentId) {
      if (!registry.networkEnabled || !registry.url) {
        return null;
      }
      const entry = registry.getEntry(agentId);
      return fetchAgentIcon({
        dataDir,
        registryUrl: registry.url,
        agentId,
        ...(entry?.icon !== undefined ? { icon: entry.icon } : {}),
        ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      });
    },

    async refreshRegistry(opts) {
      const status = await registry.refresh(opts);
      options.events?.publish({ type: "registry.updated", status });
      return status;
    },

    planInstall: (agentId) => {
      if (options.policy && !options.policy.agentAllowed(agentId)) {
        return Promise.reject(
          new SterError("blocked-by-policy", `Agent ${agentId} is blocked by organization policy`),
        );
      }
      const entry = registry.getEntry(agentId);
      if (!entry) {
        return Promise.reject(new SterError("not-found", `Unknown registry agent ${agentId}`));
      }
      const plan = planInstall({
        entry,
        platformKey,
        uvAvailable: uvAvailable(),
        requireChecksum: options.policy?.requireChecksum() === true,
        allowInstallScripts: options.policy?.allowInstallScripts() !== false,
      });
      plans.set(plan.id, plan);
      return Promise.resolve(plan);
    },

    async install(plan, onProgress) {
      const stored = plans.get(plan.id) ?? plan;
      const progress = (p: Progress): void => {
        onProgress?.(p);
        options.events?.publish({
          type: "install.progress",
          planId: stored.id,
          phase: p.phase,
          ...(p.fraction !== undefined ? { received: p.fraction } : {}),
        });
      };

      let result: { agent: Agent };
      if (stored.detail.kind === "binary") {
        result = await installBinaryAgent({
          plan: stored,
          dataDir,
          ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
          onProgress: progress,
        });
      } else if (stored.detail.kind === "npx") {
        result = await installNpmAgent({
          plan: stored,
          dataDir,
          platformKey,
          ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
          onProgress: progress,
          ...(options.seedNodeBinary !== undefined
            ? { seedNodeBinary: options.seedNodeBinary }
            : options.nodeExecutable !== undefined
              ? { seedNodeBinary: options.nodeExecutable }
              : { seedNodeBinary: process.execPath }),
          allowScripts: stored.scriptsAllowed,
        });
      } else {
        const uvPath = findOnPath("uv", options.environment);
        if (!uvPath) {
          throw new SterError("agent-not-ready", "uv is not available on PATH");
        }
        result = await installUvxAgent({
          plan: stored,
          dataDir,
          uvPath,
          onProgress: progress,
        });
      }

      const entry = registry.getEntry(stored.agentId);
      const agent: Agent = {
        ...result.agent,
        name: entry?.name ?? result.agent.name,
      };
      writeInstalled(dataDir, agent);
      plans.delete(stored.id);
      options.events?.publish({ type: "agent.changed", agentId: agent.id });
      options.log.info("agent installed", { agentId: agent.id, version: agent.version });
      return agent;
    },

    remove: (agentId) => {
      const installed = readInstalled(dataDir, agentId);
      if (!installed) {
        return Promise.reject(new SterError("not-found", `Agent ${agentId} is not installed`));
      }
      rmSync(join(dataDir, "agents", agentId), { recursive: true, force: true });
      options.events?.publish({ type: "agent.changed", agentId });
      return Promise.resolve();
    },

    saveCustom: (def) => {
      if (options.policy && !options.policy.customAgentsAllowed()) {
        return Promise.reject(
          new SterError("blocked-by-policy", "Custom agents are disabled by organization policy"),
        );
      }
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
      options.events?.publish({ type: "agent.changed", agentId: id });
      return mergeList().then((list) => {
        const agent = list.find((a) => a.id === id);
        if (!agent) {
          throw new SterError("not-found", "Custom agent missing after save");
        }
        return agent;
      });
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
      options.events?.publish({ type: "agent.changed", agentId });
      return Promise.resolve();
    },

    confirmFirstStart: (agentId) => {
      return mergeList().then((list) => {
        const agent = list.find((a) => a.id === agentId);
        if (!agent) {
          throw new SterError("not-found", `Unknown agent ${agentId}`);
        }
        if (agent.readiness === "blocked-by-policy") {
          throw new SterError("blocked-by-policy", `Agent ${agentId} is blocked by policy`);
        }
        if (!agent.launch) {
          throw new SterError("agent-not-ready", `Agent ${agentId} has no launch command`);
        }
        if (agent.readiness === "integrity-failed") {
          throw new SterError("integrity-failed", `Agent ${agentId} failed integrity check`);
        }
        options.store.setSetting(confirmedKey(agentId), now().toISOString());
        options.log.info("agent first-start confirmed", { agentId });
      });
    },

    async assertIntegrity(agentId) {
      const installed = readInstalled(dataDir, agentId);
      if (!installed?.install || !installed.launch) {
        return;
      }
      await assertLaunchIntegrity(installed.launch.command, installed.install.launchHash);
    },
  };

  // Eager sync get that includes mock/custom for session starts.
  const originalGet = service.get.bind(service);
  service.get = (agentId: string): Agent | null => {
    const wrap = (agent: Agent | null): Agent | null =>
      agent ? applyPolicyReadiness(agent) : null;
    const installed = originalGet(agentId);
    if (installed) {
      const at = confirmedAt(agentId);
      return wrap(at !== undefined ? { ...installed, confirmedAt: at } : installed);
    }
    if (agentId === MOCK_AGENT_ID) {
      return wrap(mockAgent());
    }
    const custom = loadCustoms().find((a) => a.id === agentId);
    if (custom) {
      return wrap(custom);
    }
    const detected = detectInstalledAgents({
      entries: registry.listEntries(),
      env: options.environment,
      platformKey,
      hints,
    }).find((a) => a.id === agentId);
    if (detected) {
      const at = confirmedAt(agentId);
      return wrap(at !== undefined ? { ...detected, confirmedAt: at } : detected);
    }
    return null;
  };

  return service;
}
