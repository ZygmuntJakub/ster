import type { Core, InstallPlan } from "@ster/core";

const plans = new Map<string, InstallPlan>();

export async function refreshRegistry(core: Core, force?: boolean): Promise<unknown> {
  return core.agents.refreshRegistry(force !== undefined ? { force } : undefined);
}

export async function planInstall(core: Core, agentId: string): Promise<unknown> {
  const plan = await core.agents.planInstall(agentId);
  plans.set(plan.id, plan);
  return plan;
}

export async function installAgent(
  core: Core,
  planId: string,
  onProgress?: (p: { phase: string; fraction?: number; message?: string }) => void,
): Promise<unknown> {
  const plan = plans.get(planId);
  if (!plan) {
    throw new Error(`Unknown install plan ${planId}`);
  }
  const agent = await core.agents.install(plan, onProgress);
  plans.delete(planId);
  return agent;
}

export async function removeAgent(core: Core, agentId: string): Promise<{ removed: true }> {
  await core.agents.remove(agentId);
  return { removed: true };
}

export async function saveCustom(
  core: Core,
  input: {
    id?: string;
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  },
): Promise<unknown> {
  return core.agents.saveCustom(input);
}

export async function deleteCustom(core: Core, agentId: string): Promise<{ deleted: true }> {
  await core.agents.deleteCustom(agentId);
  return { deleted: true };
}

export async function agentIcon(core: Core, agentId: string): Promise<unknown> {
  const icon = await core.agents.icon(agentId);
  if (!icon) {
    return null;
  }
  return {
    mimeType: icon.mimeType,
    dataBase64: Buffer.from(icon.data).toString("base64"),
  };
}
