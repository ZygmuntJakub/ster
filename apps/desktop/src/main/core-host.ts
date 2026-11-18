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

  const core = await createCore({
    dataDir,
    brand,
    policySources: [],
    environment,
    log,
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
