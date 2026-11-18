import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { SterError } from "../errors.js";

/**
 * SHA-256 of a launch target file (streaming).
 */
export async function hashFile(path: string): Promise<string> {
  if (!existsSync(path)) {
    throw new SterError("integrity-failed", "Launch file is missing", { path });
  }
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function hashBuffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Re-check the recorded launch hash before start (FR-077).
 */
export async function assertLaunchIntegrity(
  launchPath: string,
  expectedHash: string,
): Promise<void> {
  const actual = await hashFile(launchPath);
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new SterError("integrity-failed", "Launch file failed integrity check", {
      path: launchPath,
      expected: expectedHash,
      actual,
    });
  }
}

/**
 * Validate binary `cmd` from the registry (research.md R6).
 */
export function assertSafeBinaryCmd(cmd: string): void {
  if (!cmd.startsWith("./")) {
    throw new SterError("invalid-argument", "Binary cmd must start with ./", { cmd });
  }
  if (cmd.includes("..")) {
    throw new SterError("invalid-argument", "Binary cmd must not contain ..", { cmd });
  }
}
