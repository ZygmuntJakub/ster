import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SterError } from "../errors.js";
import type { Agent, AgentInstall, Progress } from "./agent.js";
import { hashFile } from "./integrity.js";
import { ensureManagedNode } from "./node-runtime.js";
import type { InstallPlan } from "./plan.js";
import type { PlatformKey } from "./platform.js";

const NPM_INSTALL_TIMEOUT_MS = 120_000;

function killChild(child: ChildProcess): void {
  if (child.killed) {
    return;
  }
  try {
    if (process.platform === "win32") {
      child.kill();
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // Best-effort: the process may already have exited.
  }
}

async function runNpmInstall(input: {
  nodePath: string;
  npmPath: string;
  npmCliPath?: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawnFn?: typeof spawn;
}): Promise<void> {
  const useCli = input.npmCliPath !== undefined && existsSync(input.npmCliPath);
  const command = useCli ? input.nodePath : input.npmPath;
  const args =
    useCli && input.npmCliPath !== undefined ? [input.npmCliPath, ...input.args] : input.args;
  // Node on Windows rejects spawn() of .cmd/.bat without a shell (EINVAL). Prefer node+cli above.
  const needsShell = !useCli && process.platform === "win32" && /\.(cmd|bat)$/iu.test(command);
  const timeoutMs = input.timeoutMs ?? NPM_INSTALL_TIMEOUT_MS;
  const spawnFn = input.spawnFn ?? spawn;

  await new Promise<void>((resolve, reject) => {
    const child = spawnFn(command, args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell,
      windowsHide: true,
    });

    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      killChild(child);
      reject(
        new SterError("invalid-argument", `npm install timed out after ${String(timeoutMs)}ms`, {
          command,
        }),
      );
    }, timeoutMs);

    // Drain stdout: unread pipe buffers deadlock npm on Windows.
    child.stdout.on("data", () => undefined);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new SterError("invalid-argument", `npm install failed (${String(code)})`, {
            stderr: stderr.slice(0, 2000),
          }),
        );
      }
    });
  });
}

function packageBinName(packageSpec: string): string {
  const withoutVersion = packageSpec.replace(/@[^@/]+$/, "");
  const name = withoutVersion.includes("/")
    ? withoutVersion.slice(withoutVersion.lastIndexOf("/") + 1)
    : withoutVersion;
  return name;
}

/**
 * Install an npm-distributed agent with the managed Node runtime (R6/R7).
 */
export async function installNpmAgent(input: {
  plan: InstallPlan;
  dataDir: string;
  platformKey: PlatformKey;
  fetchImpl?: typeof fetch;
  onProgress?: (p: Progress) => void;
  seedNodeBinary?: string;
  allowScripts: boolean;
  /** Injectable timeout for tests. */
  npmTimeoutMs?: number;
  /** Injectable spawn for tests. */
  spawnFn?: typeof spawn;
}): Promise<{
  agent: Agent & { install: AgentInstall; launch: NonNullable<Agent["launch"]> };
}> {
  if (input.plan.detail.kind !== "npx") {
    throw new SterError("invalid-argument", "Plan is not an npm install");
  }
  const detail = input.plan.detail;
  input.onProgress?.({ phase: "runtime", message: "Preparing managed Node runtime" });
  const runtime = await ensureManagedNode({
    dataDir: input.dataDir,
    platformKey: input.platformKey,
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
    ...(input.seedNodeBinary !== undefined ? { seedNodeBinary: input.seedNodeBinary } : {}),
  });

  const versionDir = join(input.dataDir, "agents", input.plan.agentId, input.plan.version);
  rmSync(versionDir, { recursive: true, force: true });
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(
    join(versionDir, "package.json"),
    JSON.stringify({ name: `ster-agent-${input.plan.agentId}`, private: true }, null, 2),
  );

  const npmArgs = ["install", detail.packageSpec, "--save-exact"];
  if (!input.allowScripts) {
    npmArgs.push("--ignore-scripts");
  }

  input.onProgress?.({ phase: "npm-install", message: `Installing ${detail.packageSpec}` });
  await runNpmInstall({
    nodePath: runtime.nodePath,
    npmPath: runtime.npmPath,
    ...(runtime.npmCliPath !== undefined ? { npmCliPath: runtime.npmCliPath } : {}),
    args: npmArgs,
    cwd: versionDir,
    env: {
      ...process.env,
      npm_config_ignore_scripts: input.allowScripts ? "false" : "true",
    },
    ...(input.npmTimeoutMs !== undefined ? { timeoutMs: input.npmTimeoutMs } : {}),
    ...(input.spawnFn !== undefined ? { spawnFn: input.spawnFn } : {}),
  });

  const binName = packageBinName(detail.packageSpec);
  const binPath = join(versionDir, "node_modules", ".bin", binName);
  let launchCommand = binPath;
  try {
    readFileSync(binPath);
  } catch {
    // Fallback: node running the package entry if bin shim is missing in fixtures.
    launchCommand = runtime.nodePath;
  }

  const launchHash = await hashFile(existsOr(launchCommand, runtime.nodePath));
  const install: AgentInstall = {
    path: versionDir,
    installedAt: new Date().toISOString(),
    launchHash,
    verified: "first-use",
    scriptsAllowed: input.allowScripts,
  };

  return {
    agent: {
      id: input.plan.agentId,
      name: input.plan.agentId,
      origin: "registry",
      version: input.plan.version,
      distribution: "npx",
      readiness: "ready",
      launch: {
        command: launchCommand === runtime.nodePath ? runtime.nodePath : launchCommand,
        args: launchCommand === runtime.nodePath ? [binPath, ...detail.args] : detail.args,
        env: detail.env,
      },
      install,
    },
  };
}

function existsOr(path: string, fallback: string): string {
  try {
    readFileSync(path);
    return path;
  } catch {
    return fallback;
  }
}
