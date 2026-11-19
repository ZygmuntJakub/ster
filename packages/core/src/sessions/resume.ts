import { methods, type AgentCapabilities } from "@agentclientprotocol/sdk";
import type { AcpConnection } from "../acp/connection.js";
import { SterError } from "../errors.js";
import type { Session } from "./session.js";

export type ResumeMode = "resume" | "load" | null;

/**
 * Which ACP reattach method the agent advertises (research.md R1 / data-model.md).
 */
export function resolveResumeMode(capabilities: AgentCapabilities): ResumeMode {
  const sessionCaps = capabilities.sessionCapabilities;
  if (sessionCaps?.resume != null) {
    return "resume";
  }
  if (capabilities.loadSession === true) {
    return "load";
  }
  return null;
}

export function sessionIsResumable(input: {
  session: Session;
  live: boolean;
  supportsResume?: boolean;
  supportsLoad?: boolean;
}): boolean {
  if (input.live) {
    return false;
  }
  if (!input.session.agentSessionId) {
    return false;
  }
  if (input.session.status === "needs-login") {
    return false;
  }
  return input.supportsResume === true || input.supportsLoad === true;
}

/**
 * Reattach to an agent session via `session/resume` or `session/load`.
 */
export async function reattachAgentSession(
  connection: AcpConnection,
  session: Session,
): Promise<{ mode: Exclude<ResumeMode, null>; agentSessionId: string }> {
  if (!session.agentSessionId) {
    throw new SterError("not-resumable", "Session has no agent session id");
  }
  const mode = resolveResumeMode(connection.capabilities.agentCapabilities);
  if (!mode) {
    throw new SterError("not-resumable", "Agent does not support resume or load");
  }

  if (mode === "resume") {
    await connection.client.request(methods.agent.session.resume, {
      sessionId: session.agentSessionId,
      cwd: session.cwd,
    });
    return { mode, agentSessionId: session.agentSessionId };
  }

  await connection.client.request(methods.agent.session.load, {
    sessionId: session.agentSessionId,
    cwd: session.cwd,
  });
  return { mode, agentSessionId: session.agentSessionId };
}
