import { SterError } from "../errors.js";

/**
 * Hosts the core may contact for registry and download traffic (FR-042, FR-046).
 * Confirmed download hosts are passed in per install plan; the public registry CDN
 * is always allowed when the registry mode is `public`.
 */
export const PUBLIC_REGISTRY_HOST = "cdn.agentclientprotocol.com";

export interface NetworkAllowlist {
  /** When false, no registry or download HTTPS is permitted. */
  registryEnabled: boolean;
  /** Extra https hosts confirmed for the current install/download. */
  downloadHosts: ReadonlySet<string>;
}

/**
 * Build an allow-list for registry mode and optional download hosts.
 */
export function createNetworkAllowlist(input: {
  registryEnabled: boolean;
  downloadHosts?: readonly string[];
  includePublicRegistry?: boolean;
}): NetworkAllowlist {
  const downloadHosts = new Set<string>();
  for (const host of input.downloadHosts ?? []) {
    downloadHosts.add(host.toLowerCase());
  }
  if (input.registryEnabled && input.includePublicRegistry !== false) {
    downloadHosts.add(PUBLIC_REGISTRY_HOST);
  }
  return {
    registryEnabled: input.registryEnabled,
    downloadHosts,
  };
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

/**
 * Assert a URL is https and its host is on the allow-list.
 */
export function assertAllowedHttpsUrl(url: string, allowlist: NetworkAllowlist): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SterError("invalid-argument", "Invalid URL", { url });
  }
  if (parsed.protocol !== "https:") {
    throw new SterError("blocked-by-policy", "Only https URLs are allowed", {
      url,
      protocol: parsed.protocol,
    });
  }
  if (!allowlist.registryEnabled && allowlist.downloadHosts.size === 0) {
    throw new SterError("blocked-by-policy", "Network access is disabled", { url });
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowlist.downloadHosts.has(host)) {
    throw new SterError("blocked-by-policy", "Host is not on the network allow-list", {
      url,
      host,
    });
  }
  return parsed;
}

/**
 * Assert a registry/download URL: loopback http is allowed for tests; otherwise HTTPS allow-list.
 */
export function assertAllowedNetworkUrl(url: string, allowlist: NetworkAllowlist): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SterError("invalid-argument", "Invalid URL", { url });
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
    if (!allowlist.registryEnabled && allowlist.downloadHosts.size === 0) {
      throw new SterError("blocked-by-policy", "Network access is disabled", { url });
    }
    return parsed;
  }
  return assertAllowedHttpsUrl(url, allowlist);
}
