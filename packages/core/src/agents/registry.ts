import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SterError } from "../errors.js";
import type { RegistryStatus } from "../model/events.js";
import { assertAllowedNetworkUrl, createNetworkAllowlist } from "../net/allowlist.js";

export const DEFAULT_REGISTRY_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const HOUR_MS = 60 * 60 * 1000;

const binaryTargetSchema = z
  .object({
    archive: z.string().min(1),
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    sha256: z.string().optional(),
  })
  .loose();

const packageDistSchema = z
  .object({
    package: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .loose();

const distributionSchema = z
  .object({
    binary: z.record(z.string(), binaryTargetSchema).optional(),
    npx: packageDistSchema.optional(),
    uvx: packageDistSchema.optional(),
  })
  .loose();

const agentEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    repository: z.string().optional(),
    website: z.string().optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
    license_url: z.string().optional(),
    icon: z.string().optional(),
    distribution: distributionSchema,
  })
  .loose();

export type BinaryTarget = z.infer<typeof binaryTargetSchema>;
export type PackageDist = z.infer<typeof packageDistSchema>;
export type RegistryEntry = z.infer<typeof agentEntrySchema>;
export type RegistryDocument = {
  version?: string;
  agents: RegistryEntry[];
  [key: string]: unknown;
};

export interface RegistryCacheState {
  url: string;
  fetchedAt: string;
  etag?: string;
  body: RegistryDocument;
}

export type RegistryClientMode = "public" | "custom" | "disabled";

export interface RegistryClientOptions {
  dataDir: string;
  url?: string;
  /** Organization policy registry mode (US10). Default `public`. */
  mode?: RegistryClientMode;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Minimum interval between network refreshes (default 1 hour). */
  throttleMs?: number;
}

function cachePath(dataDir: string): string {
  return join(dataDir, "registry", "cache.json");
}

/**
 * Lenient registry parse: unknown keys kept via passthrough; invalid agents dropped.
 */
export function parseRegistryDocument(input: unknown): RegistryDocument {
  const root = z
    .object({
      version: z.string().optional(),
      agents: z.array(z.unknown()).default([]),
    })
    .loose()
    .parse(input);

  const agents: RegistryEntry[] = [];
  for (const candidate of root.agents) {
    const parsed = agentEntrySchema.safeParse(candidate);
    if (parsed.success) {
      agents.push(parsed.data);
    }
  }
  const doc: RegistryDocument = { agents };
  if (root.version !== undefined) {
    doc.version = root.version;
  }
  return doc;
}

export function createRegistryClient(options: RegistryClientOptions) {
  const mode: RegistryClientMode = options.mode ?? "public";
  const url =
    mode === "disabled"
      ? ""
      : mode === "custom"
        ? (options.url ?? "")
        : (options.url ?? DEFAULT_REGISTRY_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const throttleMs = options.throttleMs ?? HOUR_MS;
  const path = cachePath(options.dataDir);

  let memory: RegistryCacheState | null = null;

  const readDisk = (): RegistryCacheState | null => {
    if (!existsSync(path)) {
      return null;
    }
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as {
        url?: string;
        etag?: string;
        fetchedAt?: string;
        body?: unknown;
      };
      if (raw.body === undefined || typeof raw.fetchedAt !== "string") {
        return null;
      }
      return {
        url: typeof raw.url === "string" ? raw.url : url,
        fetchedAt: raw.fetchedAt,
        body: parseRegistryDocument(raw.body),
        ...(typeof raw.etag === "string" ? { etag: raw.etag } : {}),
      };
    } catch {
      return null;
    }
  };

  const writeDisk = (state: RegistryCacheState): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state), "utf8");
  };

  const toStatus = (
    reachable: boolean,
    state: RegistryCacheState | null,
    error?: string,
  ): RegistryStatus => {
    const status: RegistryStatus = { reachable };
    if (state) {
      status.fetchedAt = state.fetchedAt;
      status.sourceUrl = state.url;
    }
    if (error) {
      status.error = error;
    }
    return status;
  };

  return {
    url,
    mode,
    /** True when network contact with a registry index is allowed. */
    networkEnabled: mode !== "disabled",
    getCached(): RegistryCacheState | null {
      if (mode === "disabled") {
        return null;
      }
      if (memory) {
        return memory;
      }
      memory = readDisk();
      return memory;
    },

    listEntries(): RegistryEntry[] {
      return this.getCached()?.body.agents ?? [];
    },

    getEntry(agentId: string): RegistryEntry | undefined {
      return this.listEntries().find((entry) => entry.id === agentId);
    },

    async refresh(opts?: { force?: boolean }): Promise<RegistryStatus> {
      if (mode === "disabled") {
        return toStatus(false, null, "Registry disabled by organization policy");
      }
      if (mode === "custom" && !url) {
        return toStatus(false, null, "Custom registry URL missing");
      }

      const cached = this.getCached();
      if (cached && !opts?.force && now().getTime() - Date.parse(cached.fetchedAt) < throttleMs) {
        return toStatus(true, cached);
      }

      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (cached?.etag) {
          headers["If-None-Match"] = cached.etag;
        }
        const registryHost = new URL(url).hostname;
        assertAllowedNetworkUrl(
          url,
          createNetworkAllowlist({
            registryEnabled: true,
            includePublicRegistry: mode === "public",
            downloadHosts: [registryHost],
          }),
        );
        const response = await fetchImpl(url, { headers });
        if (response.status === 304 && cached) {
          const next = { ...cached, fetchedAt: now().toISOString() };
          memory = next;
          writeDisk(next);
          return toStatus(true, next);
        }
        if (!response.ok) {
          throw new SterError("invalid-argument", `Registry HTTP ${String(response.status)}`, {
            status: response.status,
            url,
          });
        }
        const json: unknown = await response.json();
        const body = parseRegistryDocument(json);
        const etag = response.headers.get("etag") ?? undefined;
        const state: RegistryCacheState = {
          url,
          fetchedAt: now().toISOString(),
          body,
          ...(etag !== undefined ? { etag } : {}),
        };
        memory = state;
        writeDisk(state);
        return toStatus(true, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toStatus(false, cached, message);
      }
    },
  };
}

export type RegistryClient = ReturnType<typeof createRegistryClient>;

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
