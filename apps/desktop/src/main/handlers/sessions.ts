import type { Core } from "@ster/core";

/**
 * Session permission bridge helpers (US3).
 */
export async function setPermissionMode(
  core: Core,
  sessionId: string,
  mode: string,
): Promise<unknown> {
  await core.sessions.setPermissionMode(sessionId, mode);
  return core.sessions.get(sessionId);
}

/** US7: mode/model/thought_level selectors via ACP config options. */
export async function setConfigOption(
  core: Core,
  sessionId: string,
  configId: string,
  value: string,
): Promise<unknown> {
  await core.sessions.setConfigOption(sessionId, configId, value);
  return core.sessions.get(sessionId);
}

export async function listRules(core: Core, sessionId: string): Promise<unknown> {
  return core.sessions.rules(sessionId);
}

export async function revokeRule(core: Core, ruleId: string): Promise<{ revoked: true }> {
  await core.sessions.revokeRule(ruleId);
  return { revoked: true };
}

/**
 * Stop a running agent-requested command (US5).
 */
export async function killCommand(core: Core, commandRunId: string): Promise<{ killed: true }> {
  await core.sessions.killCommand(commandRunId);
  return { killed: true };
}

/** US6 session board helpers. */
export async function listSessions(
  core: Core,
  filter?: { agentId?: string; cwd?: string; status?: string },
): Promise<unknown> {
  return core.sessions.list(filter);
}

export async function resumeSession(core: Core, sessionId: string): Promise<unknown> {
  return core.sessions.resume(sessionId);
}

export async function renameSession(
  core: Core,
  sessionId: string,
  title: string,
): Promise<{ renamed: true }> {
  await core.sessions.rename(sessionId, title);
  return { renamed: true };
}

export async function deleteSession(
  core: Core,
  sessionId: string,
  runRecords: "delete" | "keep-without-text",
): Promise<{ deleted: true } | { kept: true }> {
  await core.sessions.delete(sessionId, { runRecords });
  return runRecords === "delete" ? { deleted: true } : { kept: true };
}
