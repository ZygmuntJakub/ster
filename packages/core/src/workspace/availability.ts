import { accessSync, constants, existsSync, statSync } from "node:fs";
import { SterError } from "../errors.js";

export type WorkspaceAvailability = { ok: true } | { ok: false; reason: string };

/**
 * Detect a deleted, moved, or unreadable working folder (T049).
 */
export function checkWorkspaceAvailable(cwd: string): WorkspaceAvailability {
  if (!existsSync(cwd)) {
    return { ok: false, reason: "Working folder no longer exists" };
  }
  try {
    const st = statSync(cwd);
    if (!st.isDirectory()) {
      return { ok: false, reason: "Working folder is not a directory" };
    }
    accessSync(cwd, constants.R_OK | constants.X_OK);
  } catch (error) {
    return {
      ok: false,
      reason: `Working folder is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true };
}

export function assertWorkspaceAvailable(cwd: string): void {
  const result = checkWorkspaceAvailable(cwd);
  if (!result.ok) {
    throw new SterError("invalid-argument", result.reason, { cwd });
  }
}
