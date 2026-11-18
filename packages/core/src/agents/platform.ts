import { existsSync } from "node:fs";

export type PlatformOs = "darwin" | "linux" | "windows";
export type PlatformArch = "aarch64" | "x86_64";

/** Registry platform key, including optional `-musl` on Linux (research.md R5). */
export type PlatformKey = `${PlatformOs}-${PlatformArch}` | `linux-${PlatformArch}-musl`;

export interface PlatformInfo {
  os: PlatformOs;
  arch: PlatformArch;
  isMusl: boolean;
  key: PlatformKey;
}

function mapArch(arch: string): PlatformArch | null {
  if (arch === "arm64" || arch === "aarch64") {
    return "aarch64";
  }
  if (arch === "x64" || arch === "x86_64" || arch === "amd64") {
    return "x86_64";
  }
  return null;
}

function mapOs(platform: string): PlatformOs | null {
  if (platform === "darwin") {
    return "darwin";
  }
  if (platform === "linux") {
    return "linux";
  }
  if (platform === "win32") {
    return "windows";
  }
  return null;
}

/**
 * Detect musl hosts (Alpine and similar). No glibc fallback for musl (R5).
 */
export function detectMusl(options?: {
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
}): boolean {
  const platform = options?.platform ?? process.platform;
  if (platform !== "linux") {
    return false;
  }
  const exists = options?.exists ?? existsSync;
  if (exists("/etc/alpine-release")) {
    return true;
  }
  if (exists("/lib/ld-musl-x86_64.so.1") || exists("/lib/ld-musl-aarch64.so.1")) {
    return true;
  }
  return false;
}

/**
 * Resolve the registry platform key for this host (or injected values).
 */
export function resolvePlatformKey(options?: {
  platform?: NodeJS.Platform;
  arch?: string;
  isMusl?: boolean;
}): PlatformKey {
  const os = mapOs(options?.platform ?? process.platform);
  const arch = mapArch(options?.arch ?? process.arch);
  if (!os || !arch) {
    throw new Error(
      `Unsupported platform ${options?.platform ?? process.platform}/${options?.arch ?? process.arch}`,
    );
  }
  const isMusl =
    options?.isMusl ??
    detectMusl({
      platform: options?.platform ?? process.platform,
    });
  if (os === "linux" && isMusl) {
    return `linux-${arch}-musl`;
  }
  return `${os}-${arch}`;
}

export function resolvePlatformInfo(options?: {
  platform?: NodeJS.Platform;
  arch?: string;
  isMusl?: boolean;
}): PlatformInfo {
  const os = mapOs(options?.platform ?? process.platform) ?? "linux";
  const arch = mapArch(options?.arch ?? process.arch) ?? "x86_64";
  const isMusl =
    options?.isMusl ??
    detectMusl({
      platform: options?.platform ?? process.platform,
    });
  return {
    os,
    arch,
    isMusl,
    key: resolvePlatformKey({
      platform: options?.platform ?? process.platform,
      arch: options?.arch ?? process.arch,
      isMusl,
    }),
  };
}

/**
 * Pick a binary target for the host. On musl, only `-musl` keys match (no glibc fallback).
 */
export function selectBinaryTarget<T>(
  binary: Readonly<Record<string, T>> | undefined,
  platformKey: PlatformKey,
): T | undefined {
  if (!binary) {
    return undefined;
  }
  return binary[platformKey];
}
