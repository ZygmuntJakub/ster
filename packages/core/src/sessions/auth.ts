import type { AuthMethod as SdkAuthMethod } from "@agentclientprotocol/sdk";
import { SterError } from "../errors.js";

export interface AuthMethodInfo {
  id: string;
  name: string;
  type: "agent" | "terminal";
  description?: string;
  /** Present for terminal-type methods: relaunch args/env (research.md R3). */
  terminal?: { args: string[]; env: Record<string, string> };
}

export interface TerminalLoginPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
  methodId: string;
}

/**
 * True when an error is ACP auth-required (-32000).
 */
export function isAuthRequiredError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return error.code === -32000;
  }
  return false;
}

export function toAuthMethodInfo(method: SdkAuthMethod): AuthMethodInfo {
  // Agent-type methods omit `type`; terminal methods set `type: "terminal"`.
  if ("type" in method) {
    const info: AuthMethodInfo = {
      id: method.id,
      name: method.name || method.id,
      type: "terminal",
      terminal: {
        args: method.args ?? [],
        env: method.env ?? {},
      },
    };
    if (method.description) {
      info.description = method.description;
    }
    return info;
  }

  const info: AuthMethodInfo = {
    id: method.id,
    name: method.name || method.id,
    type: "agent",
  };
  if (method.description) {
    info.description = method.description;
  }
  return info;
}

/**
 * Describe how to relaunch the agent for a terminal login method.
 */
export function describeTerminalLogin(
  launch: { command: string; args: string[]; env: Record<string, string> },
  method: AuthMethodInfo,
): TerminalLoginPlan {
  if (method.type !== "terminal" || !method.terminal) {
    throw new SterError("invalid-argument", "Not a terminal auth method", {
      methodId: method.id,
    });
  }
  return {
    methodId: method.id,
    command: launch.command,
    args: [...launch.args, ...method.terminal.args],
    env: { ...launch.env, ...method.terminal.env },
  };
}
