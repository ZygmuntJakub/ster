import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { SterError } from "../errors.js";

const agentIdRefSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  })
  .strict();

const agentCommandSchema = z
  .object({
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const templateInputSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    label: z.string().min(1),
    default: z.string().optional(),
  })
  .strict();

const templateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    description: z.string().optional(),
    prompt: z.string().min(1),
    inputs: z.array(templateInputSchema).optional(),
  })
  .strict();

const judgingCriterionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    description: z.string().min(1),
    weight: z.number().gt(0).optional(),
  })
  .strict();

const judgingSchema = z
  .object({
    scale: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .strict()
      .optional(),
    criteria: z.array(judgingCriterionSchema).min(1),
  })
  .strict();

const factoryDefinitionSchema = z
  .object({
    version: z.literal(1),
    agents: z.array(z.union([agentIdRefSchema, agentCommandSchema])).optional(),
    defaultAgent: z.string().min(1).optional(),
    permissionMode: z.string().min(1).optional(),
    templates: z.array(templateSchema).optional(),
    judging: judgingSchema.optional(),
  })
  .strict();

export type FactoryAgentRef = z.infer<typeof agentIdRefSchema>;
export type FactoryAgentCommand = z.infer<typeof agentCommandSchema>;
export type FactoryAgent = FactoryAgentRef | FactoryAgentCommand;
export type FactoryTemplate = z.infer<typeof templateSchema>;
export type FactoryJudging = z.infer<typeof judgingSchema>;
export type FactoryDefinition = z.infer<typeof factoryDefinitionSchema>;

export const FACTORY_RELATIVE_PATH = join(".ster", "factory.yaml");

export interface LocatedFactoryDefinition {
  folder: string;
  definitionPath: string;
  contentHash: string;
  raw: string;
  definition: FactoryDefinition;
}

export interface ValidateFactoryResult {
  ok: boolean;
  definition: FactoryDefinition | null;
  problems: Array<{ path: string; message: string }>;
}

export function isFactoryAgentCommand(agent: FactoryAgent): agent is FactoryAgentCommand {
  return "command" in agent;
}

export function isFactoryAgentRef(agent: FactoryAgent): agent is FactoryAgentRef {
  return "id" in agent;
}

export function hashFactoryContent(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Validate a parsed factory definition against contracts/factory.schema.json.
 */
export function validateFactoryDefinition(raw: unknown): ValidateFactoryResult {
  const parsed = factoryDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      definition: null,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    };
  }

  const definition = parsed.data;
  if (definition.defaultAgent !== undefined && definition.agents) {
    const names = new Set<string>();
    for (const agent of definition.agents) {
      if (isFactoryAgentRef(agent)) {
        names.add(agent.id);
      } else {
        names.add(agent.name);
      }
    }
    if (!names.has(definition.defaultAgent)) {
      return {
        ok: false,
        definition: null,
        problems: [
          {
            path: "defaultAgent",
            message: "defaultAgent must match an entry in agents by id or name",
          },
        ],
      };
    }
  }

  return { ok: true, definition, problems: [] };
}

/**
 * Parse YAML text into a factory definition. Does not evaluate template expressions.
 */
export function parseFactoryYaml(text: string): ValidateFactoryResult {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return {
      ok: false,
      definition: null,
      problems: [
        {
          path: "",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  return validateFactoryDefinition(raw);
}

function realDirectory(path: string): string {
  try {
    return realpathSync(resolve(path));
  } catch (error) {
    throw new SterError("invalid-argument", "Folder is missing or unreadable", {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Walk from `cwd` upward and return the nearest `.ster/factory.yaml`.
 */
export function findNearestFactoryDefinition(cwd: string): LocatedFactoryDefinition | null {
  let current = realDirectory(cwd);
  for (;;) {
    const definitionPath = join(current, FACTORY_RELATIVE_PATH);
    if (existsSync(definitionPath)) {
      const st = statSync(definitionPath);
      if (!st.isFile()) {
        throw new SterError("definition-invalid", "Factory definition path is not a file", {
          definitionPath,
        });
      }
      const raw = readFileSync(definitionPath, "utf8");
      const validated = parseFactoryYaml(raw);
      if (!validated.ok || !validated.definition) {
        throw new SterError("definition-invalid", "Factory definition failed validation", {
          definitionPath,
          problems: validated.problems,
        });
      }
      return {
        folder: current,
        definitionPath,
        contentHash: hashFactoryContent(raw),
        raw,
        definition: validated.definition,
      };
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Plain-text template rendering: replace `{{name}}` with inputs. Values are
 * substituted literally — never evaluated as code or expressions (SC-018).
 */
export function renderFactoryTemplate(prompt: string, inputs: Record<string, string>): string {
  return prompt.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(inputs, name)) {
      return "";
    }
    return inputs[name] ?? "";
  });
}
