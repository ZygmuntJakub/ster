import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Logger } from "../log.js";

export type ResolvedEnv = Readonly<Record<string, string>>;

export interface ResolveShellEnvOptions {
  timeoutMs?: number;
  /** Override the login shell binary (defaults to $SHELL or /bin/zsh|/bin/bash). */
  shell?: string;
  /** Base environment; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
  log?: Logger;
  /** Injectable spawn for tests. */
  spawnFn?: typeof spawn;
}

export type ShellEnvSource = "login-shell" | "process" | "fallback";

export interface ShellEnvResult {
  env: ResolvedEnv;
  source: ShellEnvSource;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const BEGIN_MARKER = "__STER_ENV_BEGIN__";
const END_MARKER = "__STER_ENV_END__";

function compactEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function defaultUnixShell(env: NodeJS.ProcessEnv): string {
  return env["SHELL"] && env["SHELL"].length > 0 ? env["SHELL"] : "/bin/zsh";
}

/**
 * Common per-user and package-manager binary directories used when login-shell
 * resolution fails (research.md R19).
 */
export function fallbackPathDirs(home: string, platform: NodeJS.Platform): string[] {
  const dirs = [
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    join(home, "go", "bin"),
    join(home, ".nvm", "current", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  if (platform === "darwin") {
    dirs.unshift(join(home, "Library", "pnpm"));
  }
  return dirs;
}

export function mergeFallbackPath(
  baseEnv: NodeJS.ProcessEnv,
  home: string,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env = compactEnv(baseEnv);
  const existing = (env["PATH"] ?? "").split(":").filter(Boolean);
  const merged = [...fallbackPathDirs(home, platform), ...existing];
  const seen = new Set<string>();
  env["PATH"] = merged
    .filter((dir) => {
      if (seen.has(dir)) {
        return false;
      }
      seen.add(dir);
      return true;
    })
    .join(":");
  return env;
}

/**
 * Parse `printenv`-style output captured between begin/end markers.
 */
export function parseEnvDump(stdout: string): Record<string, string> | null {
  const begin = stdout.indexOf(BEGIN_MARKER);
  const end = stdout.indexOf(END_MARKER);
  if (begin < 0 || end < 0 || end <= begin) {
    return null;
  }
  const body = stdout.slice(begin + BEGIN_MARKER.length, end).replace(/^\r?\n/u, "");
  const env: Record<string, string> = {};
  for (const line of body.split(/\r?\n/u)) {
    if (!line) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return Object.keys(env).length > 0 ? env : null;
}

function runLoginShellEnv(options: {
  shell: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  spawnFn: typeof spawn;
}): Promise<Record<string, string>> {
  const { shell, env, timeoutMs, spawnFn } = options;
  const script = `printf '%s\\n' '${BEGIN_MARKER}'; printenv; printf '%s\\n' '${END_MARKER}'`;

  return new Promise((resolve, reject) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawnFn(shell, ["-l", "-c", script], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`login shell environment timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const parsed = parseEnvDump(stdout);
      if (parsed && (code === 0 || Object.keys(parsed).length > 0)) {
        resolve(parsed);
        return;
      }
      reject(
        new Error(
          `login shell exited with code ${String(code)}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

/**
 * Resolve the environment used to detect and launch agents (research.md R19).
 */
export async function resolveShellEnv(
  options: ResolveShellEnvOptions = {},
): Promise<ShellEnvResult> {
  const platform = options.platform ?? process.platform;
  const baseEnv = options.env ?? process.env;
  const home = options.homeDir ?? homedir();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnFn = options.spawnFn ?? spawn;

  if (platform === "win32") {
    return { env: compactEnv(baseEnv), source: "process" };
  }

  const shell = options.shell ?? defaultUnixShell(baseEnv);
  try {
    const env = await runLoginShellEnv({ shell, env: baseEnv, timeoutMs, spawnFn });
    return { env, source: "login-shell" };
  } catch (error) {
    options.log?.warn("login shell environment resolution failed; using PATH fallback", {
      shell,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      env: mergeFallbackPath(baseEnv, home, platform),
      source: "fallback",
    };
  }
}
