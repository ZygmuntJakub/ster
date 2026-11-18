import { execFile } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SterError } from "../errors.js";
import { assertAllowedHttpsUrl, createNetworkAllowlist } from "../net/allowlist.js";
import type { Progress } from "./agent.js";
import { extractTarGz, isTarGz } from "./extract.js";
import { downloadToFile } from "./install-binary.js";
import type { PlatformKey } from "./platform.js";

const execFileAsync = promisify(execFile);

/**
 * Pinned Node.js for npm-distributed agents (research.md R7).
 * Checksums are official SHASUMS256 from nodejs.org for v22.14.0.
 */
export const MANAGED_NODE_VERSION = "22.14.0";

interface NodeDist {
  /** Archive filename under https://nodejs.org/dist/v{version}/ */
  file: string;
  sha256: string;
}

/** Official Node.js dist archives keyed by Ster platform key. */
export const MANAGED_NODE_DISTS: Readonly<Partial<Record<PlatformKey, NodeDist>>> = {
  "darwin-aarch64": {
    file: `node-v${MANAGED_NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: "e9404633bc02a5162c5c573b1e2490f5fb44648345d64a958b17e325729a5e42",
  },
  "darwin-x86_64": {
    file: `node-v${MANAGED_NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: "6698587713ab565a94a360e091df9f6d91c8fadda6d00f0cf6526e9b40bed250",
  },
  "linux-x86_64": {
    file: `node-v${MANAGED_NODE_VERSION}-linux-x64.tar.gz`,
    sha256: "9d942932535988091034dc94cc5f42b6dc8784d6366df3a36c4c9ccb3996f0c2",
  },
  "linux-aarch64": {
    file: `node-v${MANAGED_NODE_VERSION}-linux-arm64.tar.gz`,
    sha256: "8cf30ff7250f9463b53c18f89c6c606dfda70378215b2c905d0a9a8b08bd45e0",
  },
  "windows-x86_64": {
    file: `node-v${MANAGED_NODE_VERSION}-win-x64.zip`,
    sha256: "55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217",
  },
};

/** @deprecated Prefer MANAGED_NODE_DISTS; kept for callers that only need checksum strings. */
export const MANAGED_NODE_CHECKSUMS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MANAGED_NODE_DISTS).map(([key, dist]) => [key, dist.sha256]),
);

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

function distFor(platformKey: PlatformKey): NodeDist {
  const dist = MANAGED_NODE_DISTS[platformKey];
  if (!dist) {
    throw new SterError(
      "agent-not-ready",
      "Managed Node runtime is not available for this platform",
      { platformKey },
    );
  }
  return dist;
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  try {
    await execFileAsync("tar", ["-xf", archivePath, "-C", destDir]);
  } catch {
    await execFileAsync("unzip", ["-o", archivePath, "-d", destDir]);
  }
}

/**
 * After extracting a Node dist archive, relocate the single top-level folder into `home`.
 */
function promoteExtractedRuntime(extractDir: string, home: string): void {
  const entries = readdirSync(extractDir).filter((name) => !name.startsWith("."));
  if (entries.length !== 1 || !entries[0]) {
    throw new SterError("agent-not-ready", "Unexpected managed Node archive layout", {
      entries,
    });
  }
  const nested = join(extractDir, entries[0]);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(join(home, ".."), { recursive: true });
  try {
    renameSync(nested, home);
  } catch {
    cpSync(nested, home, { recursive: true });
    rmSync(nested, { recursive: true, force: true });
  }
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
  /** Extra download hosts allowed beyond nodejs.org (tests). */
  downloadHosts?: readonly string[];
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

  const dist = distFor(input.platformKey);
  const url = `https://nodejs.org/dist/v${MANAGED_NODE_VERSION}/${dist.file}`;
  const allowlist = createNetworkAllowlist({
    registryEnabled: true,
    includePublicRegistry: false,
    downloadHosts: ["nodejs.org", ...(input.downloadHosts ?? [])],
  });
  assertAllowedHttpsUrl(url, allowlist);

  const staging = join(input.dataDir, "runtimes", ".staging", MANAGED_NODE_VERSION);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const archivePath = join(staging, dist.file);
  input.onProgress?.({ phase: "runtime", message: `Downloading Node.js ${MANAGED_NODE_VERSION}` });
  await downloadToFile(url, archivePath, {
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
    expectedSha256: dist.sha256,
    allowlist,
  });

  input.onProgress?.({ phase: "runtime", message: "Extracting Node.js runtime" });
  const extractDir = join(staging, "extract");
  mkdirSync(extractDir, { recursive: true });
  if (isTarGz(dist.file)) {
    await extractTarGz(archivePath, extractDir);
  } else {
    await extractZip(archivePath, extractDir);
  }

  const home = managedNodeHome(input.dataDir);
  promoteExtractedRuntime(extractDir, home);
  if (!existsSync(nodePath)) {
    throw new SterError("agent-not-ready", "Managed Node binary missing after extract", {
      nodePath,
    });
  }
  chmodSync(nodePath, 0o755);
  rmSync(staging, { recursive: true, force: true });
  return { nodePath, npmPath };
}
