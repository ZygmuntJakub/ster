import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SterError } from "../errors.js";
import { downloadToFile } from "./install-binary.js";
import type { Progress } from "./agent.js";
import type { PlatformKey } from "./platform.js";

/**
 * Pinned Node.js for npm-distributed agents (research.md R7).
 * Checksums are placeholders for the fixture/test path; production builds replace them.
 */
export const MANAGED_NODE_VERSION = "22.14.0";

/** Embedded SHA-256 for official Node tarballs (filled for real releases; tests inject runtime). */
export const MANAGED_NODE_CHECKSUMS: Readonly<Record<string, string>> = {
  "darwin-aarch64": "0000000000000000000000000000000000000000000000000000000000000000",
  "darwin-x86_64": "0000000000000000000000000000000000000000000000000000000000000000",
  "linux-x86_64": "0000000000000000000000000000000000000000000000000000000000000000",
  "linux-aarch64": "0000000000000000000000000000000000000000000000000000000000000000",
  "windows-x86_64": "0000000000000000000000000000000000000000000000000000000000000000",
};

export function managedNodeHome(dataDir: string): string {
  return join(dataDir, "runtimes", "node", MANAGED_NODE_VERSION);
}

export function managedNodeBinary(dataDir: string, platformKey: PlatformKey): string {
  const home = managedNodeHome(dataDir);
  if (platformKey.startsWith("windows")) {
    return join(home, "node.exe");
  }
  return join(home, "bin", "node");
}

export function managedNpmBinary(dataDir: string, platformKey: PlatformKey): string {
  const home = managedNodeHome(dataDir);
  if (platformKey.startsWith("windows")) {
    return join(home, "npm.cmd");
  }
  return join(home, "bin", "npm");
}

/**
 * Ensure a managed Node runtime exists. Tests may pass `seedRuntime` to skip the network.
 */
export async function ensureManagedNode(input: {
  dataDir: string;
  platformKey: PlatformKey;
  fetchImpl?: typeof fetch;
  onProgress?: (p: Progress) => void;
  /** Absolute path to an existing node binary to copy/shim instead of downloading. */
  seedNodeBinary?: string;
}): Promise<{ nodePath: string; npmPath: string }> {
  const nodePath = managedNodeBinary(input.dataDir, input.platformKey);
  const npmPath = managedNpmBinary(input.dataDir, input.platformKey);
  if (existsSync(nodePath)) {
    return { nodePath, npmPath };
  }

  if (input.seedNodeBinary) {
    const home = managedNodeHome(input.dataDir);
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    // Shim: write a small launcher script that execs the seed binary.
    const launcher = `#!/bin/sh\nexec "${input.seedNodeBinary}" "$@"\n`;
    writeFileSync(nodePath, launcher, { mode: 0o755 });
    chmodSync(nodePath, 0o755);
    // npm shim uses the same node to run npm from PATH when present.
    const npmLauncher = `#!/bin/sh\nexec "${input.seedNodeBinary}" "$(command -v npm)" "$@"\n`;
    writeFileSync(npmPath, npmLauncher, { mode: 0o755 });
    return { nodePath, npmPath };
  }

  const checksum = MANAGED_NODE_CHECKSUMS[input.platformKey];
  if (!checksum || /^0+$/.test(checksum)) {
    throw new SterError(
      "agent-not-ready",
      "Managed Node runtime checksum is not configured for this platform",
      { platformKey: input.platformKey },
    );
  }

  // Production download path (not exercised until checksums are filled).
  const url = `https://nodejs.org/dist/v${MANAGED_NODE_VERSION}/node-v${MANAGED_NODE_VERSION}.tar.gz`;
  const staging = join(input.dataDir, "runtimes", ".staging");
  mkdirSync(staging, { recursive: true });
  const archivePath = join(staging, "node.tar.gz");
  await downloadToFile(url, archivePath, {
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
    expectedSha256: checksum,
  });
  throw new SterError(
    "agent-not-ready",
    "Managed Node archive extraction is not available in this build; use seedNodeBinary",
  );
}
