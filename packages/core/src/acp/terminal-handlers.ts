import { randomUUID } from "node:crypto";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
} from "@agentclientprotocol/sdk";
import { SterError } from "../errors.js";
import type { ExecuteApprovalTracker } from "../permissions/guard.js";
import { classifyFsPath } from "../permissions/guard.js";
import type { CommandRunner } from "../workspace/commands.js";

export interface TerminalHandlerContext {
  resolveSessionId(agentSessionId: string): string | undefined;
  getSessionCwd(sessionId: string): string | undefined;
  getCurrentRunId(sessionId: string): string | undefined;
  executeAllows: ExecuteApprovalTracker;
  requestGuardApproval(input: {
    sessionId: string;
    command: string;
    args: string[];
    cwd: string;
  }): Promise<boolean>;
  getRunner(sessionId: string): CommandRunner | undefined;
  ensureRunner(sessionId: string): CommandRunner;
  onStarted(
    sessionId: string,
    commandRunId: string,
    meta: {
      command: string;
      args: string[];
      cwd: string;
    },
  ): void;
}

function envRecord(env: CreateTerminalRequest["env"]): Record<string, string> | undefined {
  if (!env || env.length === 0) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const entry of env) {
    out[entry.name] = entry.value;
  }
  return out;
}

function requireRunner(
  ctx: TerminalHandlerContext,
  agentSessionId: string,
): { sessionId: string; runner: CommandRunner } {
  const sessionId = ctx.resolveSessionId(agentSessionId);
  if (!sessionId) {
    throw new SterError("not-found", "No live session for terminal request");
  }
  const runner = ctx.getRunner(sessionId) ?? ctx.ensureRunner(sessionId);
  return { sessionId, runner };
}

/**
 * ACP `terminal/*` client handlers (research.md R4, R13).
 */
export function createTerminalHandlers(ctx: TerminalHandlerContext) {
  return {
    async create(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
      const { sessionId, runner } = requireRunner(ctx, params.sessionId);
      const sessionCwd = ctx.getSessionCwd(sessionId);
      if (!sessionCwd) {
        throw new SterError("not-found", "Session has no working folder");
      }

      const requestedCwd =
        params.cwd === undefined || params.cwd === null || params.cwd === ""
          ? sessionCwd
          : params.cwd;
      const classified = classifyFsPath(sessionCwd, requestedCwd);
      const cwd =
        classified.status === "inside" ? classified.resolvedPath : classified.absolutePath;
      const args = params.args ?? [];
      const commandLine = [params.command, ...args].join(" ");

      let allowed = ctx.executeAllows.consumeExecuteAllow(sessionId);
      if (!allowed) {
        allowed = await ctx.requestGuardApproval({
          sessionId,
          command: params.command,
          args,
          cwd,
        });
      }
      if (!allowed) {
        throw new SterError("invalid-argument", "Command was not approved", {
          command: commandLine,
          cwd,
        });
      }

      const env = envRecord(params.env);
      const run = runner.start({
        command: params.command,
        args,
        cwd,
        ...(env !== undefined ? { env } : {}),
        ...(params.outputByteLimit !== undefined
          ? { outputByteLimit: params.outputByteLimit }
          : {}),
        runId: ctx.getCurrentRunId(sessionId) ?? "none",
        terminalId: randomUUID(),
      });
      ctx.onStarted(sessionId, run.id, {
        command: run.command,
        args: run.args,
        cwd: run.cwd,
      });
      return { terminalId: run.terminalId };
    },

    output(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
      const { runner } = requireRunner(ctx, params.sessionId);
      try {
        const snapshot = runner.output(params.terminalId);
        const response: TerminalOutputResponse = {
          output: snapshot.output,
          truncated: snapshot.truncated,
        };
        if (snapshot.exitStatus) {
          response.exitStatus = snapshot.exitStatus;
        }
        return Promise.resolve(response);
      } catch {
        throw new SterError("not-found", `Unknown terminal ${params.terminalId}`);
      }
    },

    async waitForExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
      const { runner } = requireRunner(ctx, params.sessionId);
      try {
        return await runner.waitForExit(params.terminalId);
      } catch {
        throw new SterError("not-found", `Unknown terminal ${params.terminalId}`);
      }
    },

    async kill(params: KillTerminalRequest): Promise<KillTerminalResponse> {
      const { runner } = requireRunner(ctx, params.sessionId);
      try {
        await runner.kill(params.terminalId);
        return {};
      } catch {
        throw new SterError("not-found", `Unknown terminal ${params.terminalId}`);
      }
    },

    async release(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
      const { runner } = requireRunner(ctx, params.sessionId);
      await runner.release(params.terminalId);
      return {};
    },
  };
}

export type TerminalHandlers = ReturnType<typeof createTerminalHandlers>;
