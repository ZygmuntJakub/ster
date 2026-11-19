import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export interface FileSnapshot {
  sessionId: string;
  path: string;
  contentHash: string;
  at: string;
}

/**
 * Content hash used for stale-write detection (FR-079).
 */
export function hashFileContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function hashFileAtPath(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return hashFileContent(readFileSync(path, "utf8"));
}

/**
 * In-memory file snapshots per session (data-model.md `FileSnapshot`).
 */
export function createSnapshotStore() {
  const bySession = new Map<string, Map<string, FileSnapshot>>();

  return {
    record(sessionId: string, path: string, content: string): FileSnapshot {
      const snap: FileSnapshot = {
        sessionId,
        path,
        contentHash: hashFileContent(content),
        at: new Date().toISOString(),
      };
      const map = bySession.get(sessionId) ?? new Map<string, FileSnapshot>();
      map.set(path, snap);
      bySession.set(sessionId, map);
      return snap;
    },

    get(sessionId: string, path: string): FileSnapshot | undefined {
      return bySession.get(sessionId)?.get(path);
    },

    /**
     * True when we have a prior snapshot and the on-disk content no longer matches.
     */
    isStale(sessionId: string, path: string): boolean {
      const snap = bySession.get(sessionId)?.get(path);
      if (!snap) {
        return false;
      }
      const current = hashFileAtPath(path);
      if (current === null) {
        return false;
      }
      return current !== snap.contentHash;
    },

    clearSession(sessionId: string): void {
      bySession.delete(sessionId);
    },
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
