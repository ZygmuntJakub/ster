import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertAllowedNetworkUrl, createNetworkAllowlist } from "../net/allowlist.js";
import type { IconData } from "./agent.js";

const MAX_ICON_BYTES = 256 * 1024;

function sameOrigin(iconUrl: string, registryUrl: string): boolean {
  try {
    const icon = new URL(iconUrl, registryUrl);
    const registry = new URL(registryUrl);
    return icon.origin === registry.origin;
  } catch {
    return false;
  }
}

/**
 * Fetch an agent icon from the registry origin only; cache on disk (R5).
 */
export async function fetchAgentIcon(input: {
  dataDir: string;
  registryUrl: string;
  agentId: string;
  icon?: string;
  fetchImpl?: typeof fetch;
}): Promise<IconData | null> {
  if (!input.icon) {
    return null;
  }
  let absolute: string;
  try {
    absolute = new URL(input.icon, input.registryUrl).toString();
  } catch {
    return null;
  }
  if (!sameOrigin(absolute, input.registryUrl)) {
    return null;
  }

  const cacheKey = createHash("sha256").update(absolute).digest("hex");
  const cachePath = join(input.dataDir, "icons", `${cacheKey}.bin`);
  const metaPath = join(input.dataDir, "icons", `${cacheKey}.json`);
  if (existsSync(cachePath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { mimeType: string };
      return { mimeType: meta.mimeType, data: new Uint8Array(readFileSync(cachePath)) };
    } catch {
      // refetch
    }
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const host = new URL(absolute).hostname;
    assertAllowedNetworkUrl(
      absolute,
      createNetworkAllowlist({
        registryEnabled: true,
        includePublicRegistry: false,
        downloadHosts: [host],
      }),
    );
    const response = await fetchImpl(absolute);
    if (!response.ok) {
      return null;
    }
    const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_ICON_BYTES) {
      return null;
    }
    mkdirSync(join(input.dataDir, "icons"), { recursive: true });
    writeFileSync(cachePath, buffer);
    writeFileSync(metaPath, JSON.stringify({ mimeType, agentId: input.agentId }));
    return { mimeType, data: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}
