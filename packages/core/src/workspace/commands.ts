import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ResolvedEnv } from "../platform/shell-env.js";
import type { CommandExit } from "../model/events.js";
import { filterAgentEnvironment } from "../acp/process.js";

export const DEFAULT_OUTPUT_BYTE_LIMIT = 1024 * 1024;

export type CommandRunState = "running" | "exited" | "killed" | "released";

export interface CommandRun {
  id: string;
  sessionId: string;
  runId: string;
  terminalId: string;
  command: string;
  args: string[];
  cwd: string;
  startedAt: string;
  endedAt?: string;
  exit?: CommandExit;
  truncated: boolean;
  state: CommandRunState;
}

export interface CommandRunnerOptions {
  sessionId: string;
  environment: ResolvedEnv;
  platform?: NodeJS.Platform;
  spawnFn?: typeof spawn;
  now?: () => Date;
  onOutput?: (run: CommandRun, chunk: string) => void;
  onExit?: (run: CommandRun) => void;
}

export interface StartCommandInput {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  outputByteLimit?: number | null;
  runId: string;
  terminalId?: string;
}

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

/**
 * Strip CSI / OSC / simple ESC control sequences before display (research.md R4).
 */
export function stripControlSequences(input: string): string {
  const csi = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "gu");
  const osc = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "gu");
  const simple = new RegExp(`${ESC}[@-Z\\\\-_]`, "gu");
  return input.replace(csi, "").replace(osc, "").replace(simple, "");
}

class OutputRing {
  private chunks: Buffer[] = [];
  private total = 0;
  truncated = false;

  constructor(private readonly limit: number) {}

  append(chunk: Buffer): string {
    if (chunk.length === 0) {
      return "";
    }
    this.chunks.push(chunk);
    this.total += chunk.length;
    while (this.total > this.limit && this.chunks.length > 0) {
      this.truncated = true;
      const first = this.chunks[0];
      if (!first) {
        break;
      }
      const overflow = this.total - this.limit;
      if (first.length <= overflow) {
        this.chunks.shift();
        this.total -= first.length;
        continue;
      }
      // Drop whole leading characters so the retained string stays valid UTF-8.
      let drop = overflow;
      while (drop < first.length) {
        const byte = first[drop];
        if (byte === undefined || (byte & 0xc0) !== 0x80) {
          break;
        }
        drop += 1;
      }
      this.chunks[0] = first.subarray(drop);
      this.total -= drop;
      break;
    }
    return chunk.toString("utf8");
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
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
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
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

interface LiveCommand {
  run: CommandRun;
  child: ChildProcessWithoutNullStreams;
  ring: OutputRing;
  exitPromise: Promise<CommandExit>;
  killed: boolean;
}

/**
 * Session-scoped agent command runner (no PTY; research.md R4).
 */
export function createCommandRunner(options: CommandRunnerOptions) {
  const platform = options.platform ?? process.platform;
  const spawnFn = options.spawnFn ?? spawn;
  const now = options.now ?? (() => new Date());
  const live = new Map<string, LiveCommand>();

  const markExit = (entry: LiveCommand, exit: CommandExit, state: CommandRunState): void => {
    if (entry.run.state !== "running" && entry.run.state !== "killed") {
      return;
    }
    entry.run.exit = exit;
    entry.run.endedAt = now().toISOString();
    entry.run.state = state;
    entry.run.truncated = entry.ring.truncated;
    options.onExit?.(entry.run);
  };

  return {
    get(commandRunId: string): CommandRun | undefined {
      return live.get(commandRunId)?.run;
    },

    list(): CommandRun[] {
      return [...live.values()].map((entry) => entry.run);
    },

    start(input: StartCommandInput): CommandRun {
      const terminalId = input.terminalId ?? randomUUID();
      const limit =
        input.outputByteLimit == null || input.outputByteLimit <= 0
          ? DEFAULT_OUTPUT_BYTE_LIMIT
          : input.outputByteLimit;
      const env = filterAgentEnvironment(options.environment, input.env ?? {});
      const detached = platform !== "win32";
      const child = spawnFn(input.command, input.args ?? [], {
        cwd: input.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        detached,
        windowsHide: true,
      });
      child.stdin.end();

      const run: CommandRun = {
        id: terminalId,
        sessionId: options.sessionId,
        runId: input.runId,
        terminalId,
        command: input.command,
        args: [...(input.args ?? [])],
        cwd: input.cwd,
        startedAt: now().toISOString(),
        truncated: false,
        state: "running",
      };

      const ring = new OutputRing(limit);
      const entry: LiveCommand = {
        run,
        child,
        ring,
        killed: false,
        exitPromise: new Promise<CommandExit>((resolve) => {
          child.on("exit", (code, signal) => {
            const exit: CommandExit = { code, signal };
            markExit(entry, exit, entry.killed ? "killed" : "exited");
            resolve(exit);
          });
          child.on("error", () => {
            const exit: CommandExit = { code: null, signal: null };
            markExit(entry, exit, entry.killed ? "killed" : "exited");
            resolve(exit);
          });
        }),
      };

      const onChunk = (buf: Buffer): void => {
        const raw = ring.append(buf);
        entry.run.truncated = ring.truncated;
        if (raw.length > 0) {
          options.onOutput?.(entry.run, stripControlSequences(raw));
        }
      };
      child.stdout.on("data", (chunk: Buffer | string) => {
        onChunk(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        onChunk(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });

      live.set(terminalId, entry);
      return run;
    },

    output(terminalId: string): {
      output: string;
      truncated: boolean;
      exitStatus?: { exitCode?: number | null; signal?: string | null };
    } {
      const entry = live.get(terminalId);
      if (!entry) {
        throw new Error(`Unknown terminal ${terminalId}`);
      }
      const result: {
        output: string;
        truncated: boolean;
        exitStatus?: { exitCode?: number | null; signal?: string | null };
      } = {
        output: stripControlSequences(entry.ring.toString()),
        truncated: entry.ring.truncated,
      };
      if (entry.run.exit) {
        result.exitStatus = {
          exitCode: entry.run.exit.code ?? null,
          signal: entry.run.exit.signal ?? null,
        };
      }
      return result;
    },

    async waitForExit(terminalId: string): Promise<{
      exitCode?: number | null;
      signal?: string | null;
    }> {
      const entry = live.get(terminalId);
      if (!entry) {
        throw new Error(`Unknown terminal ${terminalId}`);
      }
      const exit = await entry.exitPromise;
      return { exitCode: exit.code ?? null, signal: exit.signal ?? null };
    },

    async kill(terminalId: string): Promise<void> {
      const entry = live.get(terminalId);
      if (!entry) {
        throw new Error(`Unknown terminal ${terminalId}`);
      }
      if (entry.run.state !== "running") {
        return;
      }
      entry.killed = true;
      entry.run.state = "killed";
      if (entry.child.pid !== undefined) {
        await killProcessTree(entry.child.pid, platform, spawnFn);
      }
      await Promise.race([
        entry.exitPromise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 2000);
        }),
      ]);
      // Ensure listeners see a terminal killed state even if the OS exit event is delayed
      // (common on Windows after taskkill, where signal is often null).
      if (!entry.run.exit) {
        entry.run.exit = { code: null, signal: "SIGTERM" };
        entry.run.endedAt = now().toISOString();
      }
      options.onExit?.(entry.run);
    },

    async release(terminalId: string): Promise<void> {
      const entry = live.get(terminalId);
      if (!entry) {
        return;
      }
      if (entry.run.state === "running") {
        await this.kill(terminalId);
      }
      entry.run.state = "released";
      live.delete(terminalId);
    },

    async killAll(): Promise<void> {
      const ids = [...live.keys()];
      await Promise.all(
        ids.map(async (id) => {
          try {
            await this.release(id);
          } catch {
            // Best-effort cleanup.
          }
        }),
      );
    },
  };
}

export type CommandRunner = ReturnType<typeof createCommandRunner>;
