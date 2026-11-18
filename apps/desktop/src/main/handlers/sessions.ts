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

export async function listRules(core: Core, sessionId: string): Promise<unknown> {
  return core.sessions.rules(sessionId);
}

export async function revokeRule(core: Core, ruleId: string): Promise<{ revoked: true }> {
  await core.sessions.revokeRule(ruleId);
  return { revoked: true };
}
