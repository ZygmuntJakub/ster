import {
  CORE_VERSION,
  createCore,
  createLogger,
  loadBrandFromJson,
  type Brand,
  type Core,
} from "@ster/core";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app, shell } from "electron";

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
  const dataDir = join(app.getPath("userData"), brand.dataDirName);

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
  const core = await createCore({
    dataDir,
    brand,
    policySources: [],
    environment,
    log,
    nodeExecutable,
    includeMockAgent: process.env["NODE_ENV"] !== "production" && hasMockAgent,
    ...(hasMockAgent ? { mockAgentEntry } : {}),
    platform: {
      openExternal: async (url) => {
        await shell.openExternal(url);
      },
    },
  });

  return {
    core,
    brand,
    version: CORE_VERSION,
    dispose: () => core.dispose(),
  };
}
