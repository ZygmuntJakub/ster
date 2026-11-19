import { z } from "zod";
import type { OrganizationPolicy } from "./types.js";
import type { PolicyProblem } from "./service.js";

const agentIdPattern = /^[a-z][a-z0-9-]*$/;
const httpsUri = z.url().refine((value) => value.startsWith("https://"), {
  message: "registry.url must be an https URI",
});

const agentsSchema = z
  .object({
    allow: z.array(z.string().regex(agentIdPattern)).optional(),
    customAllowed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.allow !== undefined) {
      const seen = new Set<string>();
      for (const id of value.allow) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate agent id in allow: ${id}`,
            path: ["allow"],
          });
        }
        seen.add(id);
      }
    }
  });

const registrySchema = z
  .object({
    mode: z.enum(["public", "custom", "disabled"]),
    url: httpsUri.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "custom" && (value.url === undefined || value.url.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "registry.url is required when mode is custom",
        path: ["url"],
      });
    }
  });

const installSchema = z
  .object({
    requireChecksum: z.boolean().optional(),
    allowInstallScripts: z.boolean().optional(),
  })
  .strict();

const permissionsSchema = z
  .object({
    modes: z.array(z.string().min(1)).min(1).optional(),
    default: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.modes !== undefined) {
      const seen = new Set<string>();
      for (const mode of value.modes) {
        if (seen.has(mode)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate permission mode: ${mode}`,
            path: ["modes"],
          });
        }
        seen.add(mode);
      }
    }
    if (
      value.default !== undefined &&
      value.modes !== undefined &&
      !value.modes.includes(value.default)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "permissions.default must be included in permissions.modes when modes is set",
        path: ["default"],
      });
    }
  });

const knownKeys = new Set(["version", "agents", "registry", "install", "permissions"]);

export interface ValidatePolicyResult {
  ok: boolean;
  document: OrganizationPolicy | null;
  problems: PolicyProblem[];
}

/**
 * Validate a raw policy document against contracts/policy.schema.json rules.
 * Fail-closed: any schema/type/enum violation → ok false.
 * Extension keys `x-…` are retained for PolicyItemDefinition handling.
 */
export function validatePolicyDocument(raw: unknown, sourceId: string): ValidatePolicyResult {
  const problems: PolicyProblem[] = [];

  if (raw === null || raw === undefined) {
    return { ok: true, document: null, problems: [] };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    problems.push({
      path: "",
      message: "Policy document must be a JSON object",
      code: "schema",
      sourceId,
    });
    return { ok: false, document: null, problems };
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.__sterPolicyReadError === "string" && Object.keys(record).length === 1) {
    problems.push({
      path: "",
      message: `Failed to read policy: ${record.__sterPolicyReadError}`,
      code: "io",
      sourceId,
    });
    return { ok: false, document: null, problems };
  }

  if (record.version !== 1) {
    problems.push({
      path: "version",
      message: "version must be the integer 1",
      code: "schema",
      sourceId,
    });
  }

  for (const key of Object.keys(record)) {
    if (key.startsWith("x-")) {
      continue;
    }
    if (!knownKeys.has(key)) {
      problems.push({
        path: key,
        message: `Unknown top-level key "${key}" (extension keys must start with x-)`,
        code: "schema",
        sourceId,
      });
    }
  }

  let agents: OrganizationPolicy["agents"];
  if (record.agents !== undefined) {
    const parsed = agentsSchema.safeParse(record.agents);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          path: ["agents", ...issue.path.map(String)].join("."),
          message: issue.message,
          code: "schema",
          sourceId,
        });
      }
    } else {
      const next: NonNullable<OrganizationPolicy["agents"]> = {};
      if (parsed.data.allow !== undefined) {
        next.allow = parsed.data.allow;
      }
      if (parsed.data.customAllowed !== undefined) {
        next.customAllowed = parsed.data.customAllowed;
      }
      agents = next;
    }
  }

  let registry: OrganizationPolicy["registry"];
  if (record.registry !== undefined) {
    const parsed = registrySchema.safeParse(record.registry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          path: ["registry", ...issue.path.map(String)].join("."),
          message: issue.message,
          code: "schema",
          sourceId,
        });
      }
    } else {
      const next: NonNullable<OrganizationPolicy["registry"]> = { mode: parsed.data.mode };
      if (parsed.data.url !== undefined) {
        next.url = parsed.data.url;
      }
      registry = next;
    }
  }

  let install: OrganizationPolicy["install"];
  if (record.install !== undefined) {
    const parsed = installSchema.safeParse(record.install);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          path: ["install", ...issue.path.map(String)].join("."),
          message: issue.message,
          code: "schema",
          sourceId,
        });
      }
    } else {
      const next: NonNullable<OrganizationPolicy["install"]> = {};
      if (parsed.data.requireChecksum !== undefined) {
        next.requireChecksum = parsed.data.requireChecksum;
      }
      if (parsed.data.allowInstallScripts !== undefined) {
        next.allowInstallScripts = parsed.data.allowInstallScripts;
      }
      install = next;
    }
  }

  let permissions: OrganizationPolicy["permissions"];
  if (record.permissions !== undefined) {
    const parsed = permissionsSchema.safeParse(record.permissions);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          path: ["permissions", ...issue.path.map(String)].join("."),
          message: issue.message,
          code: "schema",
          sourceId,
        });
      }
    } else {
      const next: NonNullable<OrganizationPolicy["permissions"]> = {};
      if (parsed.data.modes !== undefined) {
        next.modes = parsed.data.modes;
      }
      if (parsed.data.default !== undefined) {
        next.default = parsed.data.default;
      }
      permissions = next;
    }
  }

  if (problems.length > 0) {
    return { ok: false, document: null, problems };
  }

  const document: OrganizationPolicy = { version: 1 };
  if (agents !== undefined) {
    document.agents = agents;
  }
  if (registry !== undefined) {
    document.registry = registry;
  }
  if (install !== undefined) {
    document.install = install;
  }
  if (permissions !== undefined) {
    document.permissions = permissions;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("x-")) {
      document[key] = value;
    }
  }

  return { ok: true, document, problems: [] };
}
