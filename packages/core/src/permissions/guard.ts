import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { SterError } from "../errors.js";
import { resolveWorkspacePath } from "../workspace/files.js";

export type PathClassification =
  { status: "inside"; resolvedPath: string } | { status: "outside"; absolutePath: string };

/**
 * Classify a path relative to the session cwd without throwing on outside paths.
 */
export function classifyFsPath(cwd: string, requestedPath: string): PathClassification {
  try {
    return { status: "inside", resolvedPath: resolveWorkspacePath(cwd, requestedPath) };
  } catch (error) {
    if (error instanceof SterError && error.code === "outside-workspace") {
      let root: string;
      try {
        root = realpathSync(cwd);
      } catch {
        root = cwd;
      }
      const absolutePath = isAbsolute(requestedPath)
        ? resolve(requestedPath)
        : resolve(root, requestedPath);
      return { status: "outside", absolutePath };
    }
    throw error;
  }
}

export function readAbsoluteTextFile(
  absolutePath: string,
  opts?: { line?: number | null; limit?: number | null },
): { content: string; resolvedPath: string } {
  if (!existsSync(absolutePath)) {
    throw new SterError("not-found", "File not found", { path: absolutePath });
  }
  const resolvedPath = realpathSync(absolutePath);
  let content = readFileSync(resolvedPath, "utf8");
  if (opts?.line != null || opts?.limit != null) {
    const lines = content.split("\n");
    const start = Math.max(0, (opts.line ?? 1) - 1);
    const end = opts.limit == null ? lines.length : start + Math.max(0, opts.limit);
    content = lines.slice(start, end).join("\n");
  }
  return { content, resolvedPath };
}

export function writeAbsoluteTextFile(
  absolutePath: string,
  content: string,
): { resolvedPath: string } {
  const parent = dirname(absolutePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(absolutePath, content, "utf8");
  return {
    resolvedPath: existsSync(absolutePath) ? realpathSync(absolutePath) : absolutePath,
  };
}

export const OUTSIDE_WORKSPACE_OPTIONS = [
  { optionId: "allow", name: "Allow this path once", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
] as const;

export const TERMINAL_GUARD_OPTIONS = [
  { optionId: "allow", name: "Allow command once", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
] as const;

/**
 * Tracks execute-kind approvals that cover one `terminal/create` each (R13).
 * Consumed by US5 terminal handlers.
 */
export function createExecuteApprovalTracker() {
  const pending = new Map<string, number>();

  return {
    noteExecuteAllow(sessionId: string): void {
      pending.set(sessionId, (pending.get(sessionId) ?? 0) + 1);
    },

    /**
     * Returns true when a matching execute approval is available and consumes it.
     */
    consumeExecuteAllow(sessionId: string): boolean {
      const count = pending.get(sessionId) ?? 0;
      if (count <= 0) {
        return false;
      }
      if (count === 1) {
        pending.delete(sessionId);
      } else {
        pending.set(sessionId, count - 1);
      }
      return true;
    },

    clearSession(sessionId: string): void {
      pending.delete(sessionId);
    },
  };
}

export type ExecuteApprovalTracker = ReturnType<typeof createExecuteApprovalTracker>;

/**
 * Whether a tool-call subject represents an execute-kind action.
 */
export function isExecuteToolSubject(subject: unknown): boolean {
  if (!subject || typeof subject !== "object") {
    return false;
  }
  const record = subject as Record<string, unknown>;
  return record["kind"] === "execute";
}
