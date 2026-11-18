import { createHash } from "node:crypto";
import type { Store } from "../store/store.js";
import { SterError } from "../errors.js";

export type FolderTrustState = "untrusted" | "trusted" | "changed";

export interface FolderTrust {
  folder: string;
  definitionPath: string;
  contentHash: string;
  trustedAt: string;
}

function trustKey(folder: string): string {
  const digest = createHash("sha256").update(folder).digest("hex").slice(0, 32);
  return `factory.trust.${digest}`;
}

/**
 * Read stored trust for a folder (absolute real path).
 */
export function getFolderTrust(store: Store, folder: string): FolderTrust | null {
  const raw = store.getSetting(trustKey(folder));
  if (!raw || raw.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as FolderTrust;
    if (
      typeof parsed.folder !== "string" ||
      typeof parsed.definitionPath !== "string" ||
      typeof parsed.contentHash !== "string" ||
      typeof parsed.trustedAt !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function deriveTrustState(
  stored: FolderTrust | null,
  contentHash: string,
): FolderTrustState {
  if (!stored) {
    return "untrusted";
  }
  return stored.contentHash === contentHash ? "trusted" : "changed";
}

/**
 * Persist trust for a folder after the user confirms the content hash.
 */
export function trustFolder(
  store: Store,
  input: {
    folder: string;
    definitionPath: string;
    contentHash: string;
    expectedHash: string;
    now?: () => Date;
  },
): FolderTrust {
  if (input.contentHash !== input.expectedHash) {
    throw new SterError(
      "invalid-argument",
      "Factory content hash does not match the definition on disk",
      {
        expected: input.expectedHash,
        actual: input.contentHash,
      },
    );
  }
  const record: FolderTrust = {
    folder: input.folder,
    definitionPath: input.definitionPath,
    contentHash: input.contentHash,
    trustedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  store.setSetting(trustKey(input.folder), JSON.stringify(record));
  return record;
}

export function revokeFolderTrust(store: Store, folder: string): void {
  store.setSetting(trustKey(folder), "");
}
