import { randomUUID } from "node:crypto";
import { SterError } from "../errors.js";
import type { AgentDistribution } from "./agent.js";
import type { PlatformKey } from "./platform.js";
import { selectBinaryTarget } from "./platform.js";
import type { RegistryEntry } from "./registry.js";

export interface InstallPlanLine {
  label: string;
  sizeBytes?: number;
}

export interface InstallPlan {
  id: string;
  agentId: string;
  version: string;
  source: string;
  verified: boolean;
  distribution: AgentDistribution;
  scriptsAllowed: boolean;
  requiresManagedNode: boolean;
  sizeBytes?: number;
  lines: InstallPlanLine[];
  /** Internal: which package/binary target to install. */
  detail:
    | {
        kind: "binary";
        archive: string;
        cmd: string;
        args: string[];
        env: Record<string, string>;
        sha256?: string;
      }
    | {
        kind: "npx";
        packageSpec: string;
        args: string[];
        env: Record<string, string>;
      }
    | {
        kind: "uvx";
        packageSpec: string;
        args: string[];
        env: Record<string, string>;
      };
}

export interface PlanInstallOptions {
  entry: RegistryEntry;
  platformKey: PlatformKey;
  uvAvailable: boolean;
  allowInstallScripts?: boolean;
  requireChecksum?: boolean;
  managedNodeSizeBytes?: number;
}

/**
 * Build an install confirmation plan (FR-020, FR-077).
 */
export function planInstall(options: PlanInstallOptions): InstallPlan {
  const { entry, platformKey } = options;
  const binary = selectBinaryTarget(entry.distribution.binary, platformKey);
  const npx = entry.distribution.npx;
  const uvx = entry.distribution.uvx;

  if (binary) {
    const verified = Boolean(binary.sha256);
    if (options.requireChecksum && !verified) {
      throw new SterError(
        "invalid-argument",
        "Organization policy requires a checksum for this agent",
        { agentId: entry.id },
      );
    }
    const lines: InstallPlanLine[] = [
      {
        label: `Binary archive from ${binary.archive}`,
      },
    ];
    return {
      id: randomUUID(),
      agentId: entry.id,
      version: entry.version,
      source: binary.archive,
      verified,
      distribution: "binary",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines,
      detail: {
        kind: "binary",
        archive: binary.archive,
        cmd: binary.cmd,
        args: binary.args ?? [],
        env: binary.env ?? {},
        ...(binary.sha256 !== undefined ? { sha256: binary.sha256 } : {}),
      },
    };
  }

  if (npx) {
    if (options.requireChecksum) {
      throw new SterError(
        "invalid-argument",
        "Organization policy requires a checksum; npm packages cannot provide one",
        { agentId: entry.id, distribution: "npx" },
      );
    }
    const lines: InstallPlanLine[] = [
      { label: `npm package ${npx.package}` },
      {
        label: "Managed Node.js runtime (downloaded once, checksum verified)",
        ...(options.managedNodeSizeBytes !== undefined
          ? { sizeBytes: options.managedNodeSizeBytes }
          : {}),
      },
    ];
    return {
      id: randomUUID(),
      agentId: entry.id,
      version: entry.version,
      source: npx.package,
      verified: false,
      distribution: "npx",
      scriptsAllowed: options.allowInstallScripts === true,
      requiresManagedNode: true,
      lines,
      detail: {
        kind: "npx",
        packageSpec: npx.package,
        args: npx.args ?? [],
        env: npx.env ?? {},
      },
    };
  }

  if (uvx) {
    if (!options.uvAvailable) {
      throw new SterError(
        "agent-not-ready",
        "This agent requires uv, which was not found on PATH",
        { agentId: entry.id },
      );
    }
    if (options.requireChecksum) {
      throw new SterError(
        "invalid-argument",
        "Organization policy requires a checksum; uvx packages cannot provide one",
        { agentId: entry.id, distribution: "uvx" },
      );
    }
    return {
      id: randomUUID(),
      agentId: entry.id,
      version: entry.version,
      source: uvx.package,
      verified: false,
      distribution: "uvx",
      scriptsAllowed: false,
      requiresManagedNode: false,
      lines: [{ label: `uvx package ${uvx.package}` }],
      detail: {
        kind: "uvx",
        packageSpec: uvx.package,
        args: uvx.args ?? [],
        env: uvx.env ?? {},
      },
    };
  }

  throw new SterError("agent-not-ready", "No installable distribution for this platform", {
    agentId: entry.id,
    platformKey,
  });
}

/**
 * Derive readiness for a registry entry that is not yet installed.
 */
export function readinessForRegistryEntry(input: {
  entry: RegistryEntry;
  platformKey: PlatformKey;
  uvAvailable: boolean;
  installedVersion?: string;
}): "not-installed" | "unavailable" | "update-available" {
  const { entry, platformKey, uvAvailable, installedVersion } = input;
  const hasBinary = Boolean(selectBinaryTarget(entry.distribution.binary, platformKey));
  const hasNpx = Boolean(entry.distribution.npx);
  const hasUvx = Boolean(entry.distribution.uvx) && uvAvailable;
  if (!hasBinary && !hasNpx && !hasUvx) {
    return "unavailable";
  }
  if (installedVersion && installedVersion !== entry.version) {
    return "update-available";
  }
  return "not-installed";
}
