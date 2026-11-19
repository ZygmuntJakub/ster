import { accessSync, constants } from "node:fs";
import { resolveWorkspacePath } from "@ster/core";
import { shell } from "electron";
import type { LocationIndex } from "../location-index.js";

/**
 * Open a conversation location with the system default application after
 * confirming the path resolves inside the session workspace (or was approved).
 */
export async function openLocation(options: {
  sessionId: string;
  itemSeq: number;
  locationIndex: number;
  cwd: string;
  locations: LocationIndex;
  /** Absolute paths previously allowed by a client-guard approval. */
  approvedOutside?: ReadonlySet<string>;
}): Promise<{ opened: boolean }> {
  const requested = options.locations.resolve(
    options.sessionId,
    options.itemSeq,
    options.locationIndex,
  );

  let resolved: string;
  try {
    resolved = resolveWorkspacePath(options.cwd, requested);
  } catch {
    if (options.approvedOutside?.has(requested)) {
      resolved = requested;
    } else {
      throw new Error("Location is outside the working folder");
    }
  }

  accessSync(resolved, constants.R_OK);
  const error = await shell.openPath(resolved);
  if (error) {
    throw new Error(error);
  }
  return { opened: true };
}
