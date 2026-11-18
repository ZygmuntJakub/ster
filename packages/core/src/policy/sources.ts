import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PolicySource, PolicySourceKind } from "./service.js";

/**
 * Machine-wide policy directory (research R11):
 * - macOS: `/Library/Application Support/<Brand.policyDirName>/`
 * - Windows: `%ProgramData%\<Brand.policyDirName>\`
 * - Linux: `/etc/<Brand.policyDirName>/`
 */
export function machinePolicyDir(policyDirName: string, platform = process.platform): string {
  if (platform === "darwin") {
    return join("/Library", "Application Support", policyDirName);
  }
  if (platform === "win32") {
    const programData = process.env.ProgramData ?? "C:\\ProgramData";
    return join(programData, policyDirName);
  }
  return join("/etc", policyDirName);
}

export function machinePolicyPath(policyDirName: string, platform = process.platform): string {
  return join(machinePolicyDir(policyDirName, platform), "policy.json");
}

/**
 * Read a policy JSON file. Missing file → null (absent for this source).
 * Unreadable/invalid JSON returns a sentinel object for fail-closed validation.
 */
export function filePolicySource(
  kind: PolicySourceKind,
  label: string,
  path: string,
): PolicySource {
  return {
    kind,
    label,
    load() {
      if (!existsSync(path)) {
        return Promise.resolve(null);
      }
      try {
        const text = readFileSync(path, "utf8");
        return Promise.resolve(JSON.parse(text) as object);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Promise.resolve({ __sterPolicyReadError: message });
      }
    },
  };
}

/** In-memory policy document for tests and extension injectors. */
export function memoryPolicySource(
  label: string,
  document: object | null | (() => object | null),
  kind: PolicySourceKind = "memory",
): PolicySource {
  return {
    kind,
    label,
    load() {
      if (typeof document === "function") {
        return Promise.resolve(document());
      }
      return Promise.resolve(document);
    },
  };
}
