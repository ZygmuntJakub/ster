import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { SterError } from "../errors.js";
import type { Logger } from "../log.js";
import type { ResolvedEnv } from "../platform/shell-env.js";

export interface AgentLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SpawnAgentProcessOptions {
  launch: AgentLaunch;
  /** Resolved shell environment from `resolveShellEnv` (R19). */
  environment: ResolvedEnv;
  log: Logger;
  platform?: NodeJS.Platform;
  spawnFn?: typeof spawn;
}

export interface AgentProcess {
  readonly pid: number | undefined;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill(): Promise<void>;
}

const STRIP_ENV_EXACT = new Set(["NODE_OPTIONS"]);

/**
 * Filter the launch environment: drop shell-injection variables (R14), then
 * apply the agent launch env overrides.
 */
export function filterAgentEnvironment(
  base: ResolvedEnv,
  launchEnv: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (STRIP_ENV_EXACT.has(key) || key.startsWith("ELECTRON_")) {
      continue;
    }
    out[key] = value;
  }
  for (const [key, value] of Object.entries(launchEnv)) {
    out[key] = value;
  }
  return out;
}

async function killProcessTree(
  pid: number,
  platform: NodeJS.Platform,
  spawnFn: typeof spawn,
): Promise<void> {
  if (platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawnFn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => {
        resolve();
      });
      killer.on("error", () => {
        resolve();
      });
    });
    return;
  }

  try {
    // Negative PID targets the process group when the child was spawned detached.
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

/**
 * Spawn an agent subprocess with a filtered environment and captured stderr (R14).
 */
export function spawnAgentProcess(options: SpawnAgentProcessOptions): AgentProcess {
  const platform = options.platform ?? process.platform;
  const spawnFn = options.spawnFn ?? spawn;
  const env = filterAgentEnvironment(options.environment, options.launch.env);
  const detached = platform !== "win32";

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnFn(options.launch.command, options.launch.args, {
      cwd: options.launch.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached,
      windowsHide: true,
    });
  } catch (cause) {
    throw new SterError("agent-exited", "Failed to spawn agent process", {
      cause: cause instanceof Error ? cause.message : String(cause),
      command: options.launch.command,
    });
  }

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/u)) {
      if (line.length > 0) {
        options.log.warn("agent stderr", { line, pid: child.pid });
      }
    }
  });

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("exit", (code, signal) => {
      resolve({ code, signal });
    });
    child.on("error", (error) => {
      options.log.error("agent process error", {
        error: error.message,
        pid: child.pid,
      });
      resolve({ code: null, signal: null });
    });
  });

  let killed = false;

  return {
    get pid() {
      return child.pid;
    },
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    exit,
    async kill() {
      if (killed) {
        return;
      }
      killed = true;
      if (child.pid === undefined) {
        return;
      }
      await killProcessTree(child.pid, platform, spawnFn);
      await Promise.race([
        exit,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        }),
      ]);
    },
  };
}
