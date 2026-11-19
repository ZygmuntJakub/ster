import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { SterError } from "../errors.js";

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/**
 * Realpath the longest existing prefix so `/var` vs `/private/var` (and similar
 * symlink mounts) compare equal to a realpath'd workspace root.
 */
function realpathExistingPrefix(absolute: string): string {
  if (existsSync(absolute)) {
    return realpathSync(absolute);
  }
  let probe = dirname(absolute);
  const suffixParts: string[] = [absolute.slice(probe.length)];
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) {
      return absolute;
    }
    suffixParts.unshift(probe.slice(parent.length));
    probe = parent;
  }
  return realpathSync(probe) + suffixParts.join("");
}

/**
 * Resolve a path against the session cwd and ensure it stays inside the workspace
 * after symlink resolution. Rejects `..` escapes and out-of-tree symlinks.
 */
export function resolveWorkspacePath(cwd: string, requestedPath: string): string {
  let root: string;
  try {
    root = realpathSync(cwd);
  } catch (error) {
    throw new SterError("invalid-argument", "Working folder is missing or unreadable", {
      cwd,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const absolute = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(root, requestedPath);

  let normalized: string;
  try {
    normalized = realpathExistingPrefix(absolute);
  } catch (error) {
    throw new SterError("outside-workspace", "Path is not resolvable inside the workspace", {
      path: requestedPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isInsideRoot(root, normalized)) {
    throw new SterError("outside-workspace", "Path is outside the working folder", {
      path: requestedPath,
      resolved: normalized,
      cwd: root,
    });
  }

  if (existsSync(normalized)) {
    // Re-check after full realpath in case normalized still followed a link out.
    let real: string;
    try {
      real = realpathSync(normalized);
    } catch (error) {
      throw new SterError("outside-workspace", "Path is not resolvable inside the workspace", {
        path: requestedPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (!isInsideRoot(root, real)) {
      throw new SterError("outside-workspace", "Path is outside the working folder", {
        path: requestedPath,
        resolved: real,
        cwd: root,
      });
    }
    return real;
  }

  return normalized;
}

export function readWorkspaceTextFile(
  cwd: string,
  requestedPath: string,
  opts?: { line?: number | null; limit?: number | null },
): { content: string; resolvedPath: string } {
  const resolvedPath = resolveWorkspacePath(cwd, requestedPath);
  if (!existsSync(resolvedPath)) {
    throw new SterError("not-found", "File not found", { path: requestedPath });
  }
  let content = readFileSync(resolvedPath, "utf8");
  if (opts?.line != null || opts?.limit != null) {
    const lines = content.split("\n");
    const start = Math.max(0, (opts.line ?? 1) - 1);
    const end = opts.limit == null ? lines.length : start + Math.max(0, opts.limit);
    content = lines.slice(start, end).join("\n");
  }
  return { content, resolvedPath };
}

export function writeWorkspaceTextFile(
  cwd: string,
  requestedPath: string,
  content: string,
): { resolvedPath: string } {
  const resolvedPath = resolveWorkspacePath(cwd, requestedPath);
  const parent = dirname(resolvedPath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(resolvedPath, content, "utf8");
  return { resolvedPath };
}
