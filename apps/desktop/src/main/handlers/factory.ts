import type { Core } from "@ster/core";

export async function factoryFind(core: Core, cwd: string): Promise<unknown> {
  return core.factory.find(cwd);
}

export async function factoryTrust(
  core: Core,
  folder: string,
  contentHash: string,
): Promise<{ trusted: true }> {
  await core.factory.trust(folder, contentHash);
  return { trusted: true };
}

export async function factoryRevoke(core: Core, folder: string): Promise<{ revoked: true }> {
  await core.factory.revoke(folder);
  return { revoked: true };
}

export async function factoryRenderTemplate(
  core: Core,
  sessionId: string,
  templateId: string,
  inputs: Record<string, string>,
): Promise<{ text: string }> {
  const text = await core.factory.renderTemplate(sessionId, templateId, inputs);
  return { text };
}

export async function factoryApplied(core: Core, sessionId: string): Promise<unknown> {
  return core.factory.applied(sessionId);
}
