import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SterError } from "../errors.js";
import type { Agent, AgentInstall, Progress } from "./agent.js";
import { hashBuffer } from "./integrity.js";
import type { InstallPlan } from "./plan.js";

/**
 * Record a uvx-based agent launch (runs via `uvx` on PATH when present) (R6).
 */
export function installUvxAgent(input: {
  plan: InstallPlan;
  dataDir: string;
  uvPath: string;
  onProgress?: (p: Progress) => void;
}): Promise<{
  agent: Agent & { install: AgentInstall; launch: NonNullable<Agent["launch"]> };
}> {
  if (input.plan.detail.kind !== "uvx") {
    return Promise.reject(new SterError("invalid-argument", "Plan is not a uvx install"));
  }
  const detail = input.plan.detail;
  input.onProgress?.({ phase: "uvx", message: `Configuring ${detail.packageSpec}` });

  const versionDir = join(input.dataDir, "agents", input.plan.agentId, input.plan.version);
  mkdirSync(versionDir, { recursive: true });
  const marker = join(versionDir, "uvx.json");
  writeFileSync(
    marker,
    JSON.stringify(
      {
        package: detail.packageSpec,
        args: detail.args,
        env: detail.env,
        uvPath: input.uvPath,
      },
      null,
      2,
    ),
  );

  const launchHash = hashBuffer(Buffer.from(`${input.uvPath}\0${detail.packageSpec}`));
  return Promise.resolve({
    agent: {
      id: input.plan.agentId,
      name: input.plan.agentId,
      origin: "registry",
      version: input.plan.version,
      distribution: "uvx",
      readiness: "ready",
      launch: {
        command: input.uvPath,
        args: ["tool", "run", detail.packageSpec, ...detail.args],
        env: detail.env,
      },
      install: {
        path: versionDir,
        installedAt: new Date().toISOString(),
        launchHash,
        verified: "first-use",
        scriptsAllowed: false,
      },
    },
  });
}
