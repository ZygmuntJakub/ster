import {
  CORE_VERSION,
  createCore,
  createLogger,
  filePolicySource,
  loadBrandFromJson,
  machinePolicyPath,
  type Brand,
  type Core,
} from "@ster/core";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app, shell } from "electron";
import { dataDirSegmentFromBrand } from "./brand-surface.js";
import { setupMainI18n } from "./i18n.js";
import { resolveAppLanguage } from "./language.js";

export interface CoreHost {
  readonly core: Core;
  readonly brand: Brand;
  readonly version: string;
  dispose(): Promise<void>;
}

function resolveBrandPath(): string {
  const candidates = [
    join(app.getAppPath(), "resources", "brand.json"),
    // electron-vite production build runs from `out/main`.
    join(__dirname, "../../resources/brand.json"),
    join(process.cwd(), "resources", "brand.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`brand.json not found; looked in:\n${candidates.join("\n")}`);
}

function loadBrand(): Brand {
  return loadBrandFromJson(readFileSync(resolveBrandPath(), "utf8"));
}

/**
 * Create and own the core instance for the desktop main process.
 */
export async function startCoreHost(): Promise<CoreHost> {
  const brand = loadBrand();
  const log = createLogger({ fields: { component: "desktop" } });
  const dataDir = join(app.getPath("userData"), dataDirSegmentFromBrand(brand));

  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      environment[key] = value;
    }
  }

  // Bundled main lives at apps/desktop/out/main → four levels up to the repo root.
  const mockAgentEntry = join(__dirname, "../../../../packages/mock-agent/src/index.ts");
  const hasMockAgent = existsSync(mockAgentEntry);
  // Under Electron, process.execPath is the Electron binary — mock ACP agents need Node.
  const nodeExecutable =
    process.env["STER_NODE_BINARY"] ??
    process.env["npm_node_execpath"] ??
    environment["STER_NODE_BINARY"] ??
    "node";

  const hintsCandidates = [
    join(app.getAppPath(), "resources", "agent-hints.json"),
    join(__dirname, "../../resources/agent-hints.json"),
    join(process.cwd(), "resources", "agent-hints.json"),
  ];
  let agentHints: Record<string, string[]> | undefined;
  for (const candidate of hintsCandidates) {
    if (existsSync(candidate)) {
      agentHints = JSON.parse(readFileSync(candidate, "utf8")) as Record<string, string[]>;
      break;
    }
  }

  const systemLanguage = resolveAppLanguage(app.getLocale());

  const builtinPolicyCandidates = [
    join(app.getAppPath(), "resources", "policy.default.json"),
    join(__dirname, "../../resources/policy.default.json"),
    join(process.cwd(), "resources", "policy.default.json"),
  ];
  const builtinPolicyPath =
    builtinPolicyCandidates.find((candidate) => existsSync(candidate)) ??
    join(process.cwd(), "resources", "policy.default.json");
  const machinePath = machinePolicyPath(brand.policyDirName);

  const core = await createCore({
    dataDir,
    brand,
    policySources: [
      filePolicySource("builtin", builtinPolicyPath, builtinPolicyPath),
      filePolicySource("machine", machinePath, machinePath),
    ],
    environment,
    log,
    nodeExecutable,
    settingsDefaults: { language: systemLanguage },
    includeMockAgent: process.env["NODE_ENV"] !== "production" && hasMockAgent,
    ...(hasMockAgent ? { mockAgentEntry } : {}),
    ...(agentHints !== undefined ? { agentHints } : {}),
    ...(process.env["STER_REGISTRY_URL"] ? { registryUrl: process.env["STER_REGISTRY_URL"] } : {}),
    platform: {
      openExternal: async (url) => {
        await shell.openExternal(url);
      },
    },
  });

  await setupMainI18n(core.settings.get().language);

  return {
    core,
    brand,
    version: CORE_VERSION,
    dispose: () => core.dispose(),
  };
}
