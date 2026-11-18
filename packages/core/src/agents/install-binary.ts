import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SterError } from "../errors.js";
import {
  assertAllowedHttpsUrl,
  createNetworkAllowlist,
  type NetworkAllowlist,
} from "../net/allowlist.js";
import type { Agent, AgentInstall, AgentLaunch, Progress } from "./agent.js";
import { extractTarGz, installRawBinary, isTarGz } from "./extract.js";
import { assertSafeBinaryCmd, hashBuffer, hashFile } from "./integrity.js";
import type { InstallPlan } from "./plan.js";

export interface BinaryInstallResult {
  agent: Omit<Agent, "readiness" | "confirmedAt"> & {
    readiness: "ready";
    install: AgentInstall;
    launch: AgentLaunch;
  };
}

function assertDownloadUrl(url: string, allowlist?: NetworkAllowlist): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SterError("invalid-argument", "Archive URL is invalid", { url });
  }
  // http allowed only for local fixture servers in tests (127.0.0.1 / localhost).
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      throw new SterError("invalid-argument", "Archive URL must use HTTPS", { url });
    }
    return;
  }
  if (parsed.protocol !== "https:") {
    throw new SterError("invalid-argument", "Archive URL must use HTTPS", { url });
  }
  if (allowlist) {
    assertAllowedHttpsUrl(url, allowlist);
  }
}

export async function downloadToFile(
  url: string,
  destPath: string,
  options: {
    fetchImpl?: typeof fetch;
    onProgress?: (p: Progress) => void;
    expectedSha256?: string;
    allowlist?: NetworkAllowlist;
  },
): Promise<{ bytes: Buffer; sha256: string }> {
  assertDownloadUrl(url, options.allowlist);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok || !response.body) {
    throw new SterError("invalid-argument", `Download failed (${String(response.status)})`, {
      url,
      status: response.status,
    });
  }
  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  if (total) {
    options.onProgress?.({
      phase: "download",
      fraction: 1,
      message: `Downloaded ${String(bytes.byteLength)} bytes`,
    });
  } else {
    options.onProgress?.({
      phase: "download",
      message: `Downloaded ${String(bytes.byteLength)} bytes`,
    });
  }
  const sha256 = hashBuffer(bytes);
  if (options.expectedSha256 && sha256.toLowerCase() !== options.expectedSha256.toLowerCase()) {
    throw new SterError("integrity-failed", "Archive checksum mismatch", {
      expected: options.expectedSha256,
      actual: sha256,
      url,
    });
  }
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, bytes);
  return { bytes, sha256 };
}

/**
 * Install a binary distribution into `<data>/agents/<id>/<version>/`.
 */
export async function installBinaryAgent(input: {
  plan: InstallPlan;
  dataDir: string;
  fetchImpl?: typeof fetch;
  onProgress?: (p: Progress) => void;
  allowlist?: NetworkAllowlist;
}): Promise<BinaryInstallResult> {
  if (input.plan.detail.kind !== "binary") {
    throw new SterError("invalid-argument", "Plan is not a binary install");
  }
  const detail = input.plan.detail;
  assertSafeBinaryCmd(detail.cmd);

  const versionDir = join(input.dataDir, "agents", input.plan.agentId, input.plan.version);
  const staging = join(input.dataDir, "agents", ".staging", input.plan.id);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  let allowlist = input.allowlist;
  if (!allowlist) {
    try {
      const host = new URL(detail.archive).hostname;
      allowlist = createNetworkAllowlist({
        registryEnabled: true,
        includePublicRegistry: false,
        downloadHosts: [host],
      });
    } catch {
      allowlist = undefined;
    }
  }

  try {
    input.onProgress?.({ phase: "download", message: "Downloading archive" });
    const archivePath = join(staging, "archive.bin");
    const downloaded = await downloadToFile(detail.archive, archivePath, {
      ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
      ...(detail.sha256 !== undefined ? { expectedSha256: detail.sha256 } : {}),
      ...(allowlist !== undefined ? { allowlist } : {}),
    });

    input.onProgress?.({ phase: "extract", message: "Extracting archive" });
    const extractDir = join(staging, "extract");
    mkdirSync(extractDir, { recursive: true });
    if (isTarGz(detail.archive)) {
      await extractTarGz(archivePath, extractDir);
    } else {
      await installRawBinary(archivePath, extractDir, detail.cmd);
    }

    const launchRelative = detail.cmd.replace(/^\.\//, "");
    const launchPath = resolve(extractDir, launchRelative);
    if (!launchPath.startsWith(resolve(extractDir))) {
      throw new SterError("invalid-argument", "Launch path escapes install directory", {
        cmd: detail.cmd,
      });
    }
    // Ensure file exists (raw install already placed it; tar may have nested layout).
    try {
      readFileSync(launchPath);
    } catch {
      throw new SterError("invalid-argument", "Launch command not found after extract", {
        cmd: detail.cmd,
        launchPath,
      });
    }

    rmSync(versionDir, { recursive: true, force: true });
    mkdirSync(dirname(versionDir), { recursive: true });
    renameSync(extractDir, versionDir);

    const finalLaunch = join(versionDir, launchRelative);
    const launchHash = await hashFile(finalLaunch);
    const verified = detail.sha256 ? "registry" : "first-use";
    const install: AgentInstall = {
      path: versionDir,
      installedAt: new Date().toISOString(),
      launchHash: detail.sha256 ? downloaded.sha256 : launchHash,
      // For first-use without registry sha, record the launch file hash (R6).
      verified,
      scriptsAllowed: false,
    };
    // Prefer launch-file hash for integrity re-check (FR-077).
    install.launchHash = launchHash;

    return {
      agent: {
        id: input.plan.agentId,
        name: input.plan.agentId,
        origin: "registry",
        version: input.plan.version,
        distribution: "binary",
        readiness: "ready",
        launch: {
          command: finalLaunch,
          args: detail.args,
          env: detail.env,
        },
        install,
      },
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
