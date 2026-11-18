import { existsSync, accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { ResolvedEnv } from "../platform/shell-env.js";
import type { RegistryEntry } from "./registry.js";
import { type PlatformKey, selectBinaryTarget } from "./platform.js";
import type { Agent, AgentHints, AgentLaunch } from "./agent.js";

function cmdBasename(cmd: string): string {
  const cleaned = cmd.replace(/^\.\//, "").replace(/\\/g, "/");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] ?? cleaned;
}

function pathDirs(env: ResolvedEnv): string[] {
  const pathValue = env["PATH"] ?? env["Path"] ?? "";
  return pathValue.split(delimiter).filter(Boolean);
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return existsSync(path);
  }
}

/**
 * Resolve an executable name against PATH directories from the shell environment (R8/R19).
 */
export function findOnPath(
  name: string,
  env: ResolvedEnv,
  options?: { pathExt?: string },
): string | undefined {
  if (isAbsolute(name) && existsSync(name)) {
    return name;
  }
  const exts =
    options?.pathExt ?? (process.platform === "win32" ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT") : "");
  const extensions = process.platform === "win32" ? exts.split(";").filter(Boolean) : [""];

  for (const dir of pathDirs(env)) {
    for (const ext of extensions) {
      const candidate = join(
        dir,
        name.includes(".") || !ext ? name : `${name}${ext.toLowerCase()}`,
      );
      if (isExecutable(candidate)) {
        return candidate;
      }
      // Also try original case ext on Windows.
      if (ext) {
        const alt = join(dir, `${name}${ext}`);
        if (isExecutable(alt)) {
          return alt;
        }
      }
    }
  }
  return undefined;
}

/**
 * Detect agents already present on PATH for registry entries (research.md R8).
 */
export function detectInstalledAgents(input: {
  entries: ReadonlyArray<RegistryEntry>;
  env: ResolvedEnv;
  platformKey: PlatformKey;
  hints: AgentHints;
}): Agent[] {
  const found: Agent[] = [];

  for (const entry of input.entries) {
    const binary = selectBinaryTarget(entry.distribution.binary, input.platformKey);
    let launch: AgentLaunch | undefined;

    if (binary) {
      const binName = cmdBasename(binary.cmd);
      const resolved = findOnPath(binName, input.env);
      if (resolved) {
        launch = {
          command: resolved,
          args: binary.args ?? [],
          env: binary.env ?? {},
        };
      }
    }

    if (!launch && entry.distribution.npx) {
      const hintNames = input.hints[entry.id] ?? [];
      for (const hint of hintNames) {
        const resolved = findOnPath(hint, input.env);
        if (resolved) {
          launch = {
            command: resolved,
            args: entry.distribution.npx.args ?? [],
            env: entry.distribution.npx.env ?? {},
          };
          break;
        }
      }
    }

    if (!launch) {
      continue;
    }

    found.push({
      id: entry.id,
      name: entry.name,
      origin: "detected",
      version: entry.version,
      distribution: "none",
      readiness: "ready",
      launch,
    });
  }

  return found;
}
