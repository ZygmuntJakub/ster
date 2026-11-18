import { randomUUID } from "node:crypto";
import { basename } from "node:path";

export interface FolderTokenRecord {
  token: string;
  path: string;
  displayPath: string;
}

export interface AttachmentTokenRecord {
  token: string;
  path: string;
  name: string;
  sessionId: string;
}

/**
 * Single-purpose path tokens for the bridge (contracts/ipc.md).
 * Tokens never leave the main process as resolvable paths to the renderer
 * except as display-only labels.
 */
export function createTokenStore() {
  const folders = new Map<string, FolderTokenRecord>();
  const attachments = new Map<string, AttachmentTokenRecord>();

  return {
    issueFolder(path: string): FolderTokenRecord {
      const record: FolderTokenRecord = {
        token: `folder:${randomUUID()}`,
        path,
        displayPath: path,
      };
      folders.set(record.token, record);
      return record;
    },

    resolveFolder(token: string): FolderTokenRecord {
      const record = folders.get(token);
      if (!record) {
        throw new Error(`Unknown folder token`);
      }
      return record;
    },

    issueAttachment(sessionId: string, path: string): AttachmentTokenRecord {
      const record: AttachmentTokenRecord = {
        token: `attach:${randomUUID()}`,
        path,
        name: basename(path),
        sessionId,
      };
      attachments.set(record.token, record);
      return record;
    },

    resolveAttachment(token: string, sessionId: string): AttachmentTokenRecord {
      const record = attachments.get(token);
      if (!record || record.sessionId !== sessionId) {
        throw new Error(`Unknown attachment token`);
      }
      return record;
    },

    clear(): void {
      folders.clear();
      attachments.clear();
    },
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
