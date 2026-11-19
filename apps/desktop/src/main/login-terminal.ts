import { randomUUID } from "node:crypto";
import type { Core } from "@ster/core";
import { EVENT_CHANNEL } from "../shared/bridge.js";

export interface LoginTerminalStartResult {
  terminalToken: string;
  commandPreview: string;
}

export interface LoginTerminalManager {
  start(sessionId: string, methodId: string): Promise<LoginTerminalStartResult>;
  input(terminalToken: string, data: string): void;
  resize(terminalToken: string, cols: number, rows: number): void;
  dispose(): void;
}

interface LiveTerminal {
  token: string;
  sessionId: string;
  pty: {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
    onData(cb: (data: string) => void): void;
    onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  };
}

type WindowLike = {
  isDestroyed(): boolean;
  webContents: { send(channel: string, payload: unknown): void };
};

type PtySpawn = (
  file: string,
  args: string[] | string,
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  },
) => LiveTerminal["pty"];

/**
 * Interactive login PTY (research.md R3). Only runs an agent-declared terminal auth method.
 */
export function createLoginTerminalManager(options: {
  core: Core;
  getWindows: () => WindowLike[];
  environment: Record<string, string>;
  spawnPty?: PtySpawn;
}): LoginTerminalManager {
  const live = new Map<string, LiveTerminal>();

  const broadcast = (payload: unknown): void => {
    for (const win of options.getWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(EVENT_CHANNEL, payload);
      }
    }
  };

  const loadPtySpawn = async (): Promise<PtySpawn> => {
    if (options.spawnPty) {
      return options.spawnPty;
    }
    const mod = (await import("node-pty")) as { spawn: PtySpawn };
    return mod.spawn;
  };

  return {
    async start(sessionId, methodId) {
      const plan = await options.core.sessions.describeTerminalLogin(sessionId, methodId);
      const spawn = await loadPtySpawn();
      const token = `term:${randomUUID()}`;
      const env = { ...options.environment, ...plan.env };
      const pty = spawn(plan.command, plan.args, {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: options.environment["HOME"] ?? process.cwd(),
        env,
      });

      const entry: LiveTerminal = { token, sessionId, pty };
      live.set(token, entry);

      pty.onData((data) => {
        broadcast({
          type: "login.terminal.data",
          terminalToken: token,
          data,
          at: new Date().toISOString(),
          n: 0,
        });
      });

      pty.onExit(({ exitCode }) => {
        live.delete(token);
        broadcast({
          type: "login.terminal.exit",
          terminalToken: token,
          exitCode,
          at: new Date().toISOString(),
          n: 0,
        });
        if (exitCode === 0) {
          void options.core.sessions.restart(sessionId).catch(() => {
            // Renderer observes session.status / failure via core events.
          });
        }
      });

      const preview = [plan.command, ...plan.args].join(" ");
      return { terminalToken: token, commandPreview: preview };
    },

    input(terminalToken, data) {
      const entry = live.get(terminalToken);
      if (!entry) {
        throw new Error("Unknown login terminal");
      }
      entry.pty.write(data);
    },

    resize(terminalToken, cols, rows) {
      const entry = live.get(terminalToken);
      if (!entry) {
        throw new Error("Unknown login terminal");
      }
      entry.pty.resize(cols, rows);
    },

    dispose() {
      for (const entry of live.values()) {
        try {
          entry.pty.kill();
        } catch {
          // ignore
        }
      }
      live.clear();
    },
  };
}
